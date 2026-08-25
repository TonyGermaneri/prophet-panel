#include "MidiHub.h"

#include <algorithm>

const juce::String MidiHub::hostPortId { "host" };
const juce::String MidiHub::hostPortName { "DAW / Host" };

namespace
{
/** Fast enough that a knob sweep feels direct, slow enough that a bulk dump arrives in batches. */
constexpr int drainIntervalMs = 5;

/** A ceiling on the backlog, so a stuck UI cannot let a chatty device exhaust memory. */
constexpr size_t maxPending = 8192;
} // namespace

MidiHub::MidiHub()
    : deviceListConnection (juce::MidiDeviceListConnection::make ([this] { refreshDevices(); }))
{
    timerScratch.reserve (scratchReserve);
}

MidiHub::~MidiHub()
{
    stop();
}

void MidiHub::start()
{
    refreshDevices();
    startTimer (drainIntervalMs);
}

void MidiHub::stop()
{
    stopTimer();

    for (auto& [id, input] : openInputs)
        input->stop();

    openInputs.clear();
    openOutputs.clear();

    const juce::ScopedLock sl (deviceLock);
    pending.clear();
}

void MidiHub::refreshDevices()
{
    const auto available = juce::MidiInput::getAvailableDevices();

    // Close what has gone away, so an unplugged device does not leave a dead port open.
    for (auto it = openInputs.begin(); it != openInputs.end();)
    {
        const auto stillPresent = std::any_of (available.begin(), available.end(),
                                               [&] (const auto& d) { return d.identifier == it->first; });
        if (stillPresent)
            ++it;
        else
            it = openInputs.erase (it);
    }

    for (const auto& device : available)
    {
        if (openInputs.find (device.identifier) != openInputs.end())
            continue;

        if (auto input = juce::MidiInput::openDevice (device.identifier, this))
        {
            input->start();
            openInputs.emplace (device.identifier, std::move (input));
        }
    }

    // Outputs are reopened lazily on the next send. Holding one across a device change risks
    // writing into a port that no longer exists.
    openOutputs.clear();

    if (portsChangedFn != nullptr)
        portsChangedFn();
}

juce::Array<juce::MidiDeviceInfo> MidiHub::inputs() const
{
    auto list = juce::MidiInput::getAvailableDevices();

    // Last, deliberately. When nothing has been chosen yet the app falls back to the first input as
    // the synth's own port, and the host is the one input that is certainly not a Prophet.
    list.add ({ hostPortName, hostPortId });
    return list;
}

juce::Array<juce::MidiDeviceInfo> MidiHub::outputs() const
{
    return juce::MidiOutput::getAvailableDevices();
}

void MidiHub::send (const juce::String& outputId, const juce::uint8* data, size_t size)
{
    if (size == 0)
        return;

    if (outputId.isEmpty())
        return;

    auto it = openOutputs.find (outputId);

    if (it == openOutputs.end())
    {
        auto output = juce::MidiOutput::openDevice (outputId);
        if (output == nullptr)
            return;

        it = openOutputs.emplace (outputId, std::move (output)).first;
    }

    // One MidiMessage per message, not one per buffer.
    //
    // An NRPN is four control changes — twelve bytes — and handing all twelve to MidiMessage
    // produces one message that claims to be a control change and is four times too long. JUCE
    // asserts on exactly that in debug, and in release it goes out to CoreMIDI, which on macOS
    // now translates everything into Universal MIDI Packets before sending. A malformed message
    // does not survive that translation intact, which is why program changes and sysex — each a
    // single well-formed message — worked while no knob ever moved the synth.
    int position = 0;
    juce::uint8 runningStatus = 0;

    while (position < static_cast<int> (size))
    {
        int used = 0;
        const juce::MidiMessage message (data + position,
                                         static_cast<int> (size) - position,
                                         used,
                                         runningStatus);

        if (used <= 0)
            break;

        if (message.getRawDataSize() > 0)
        {
            it->second->sendMessageNow (message);

            // Kept so a buffer that does use running status is still parsed correctly. Nothing
            // here emits it, but this reads whatever it is given rather than only its own output.
            const auto status = message.getRawData()[0];
            if (status >= 0x80 && status < 0xf0)
                runningStatus = status;
        }

        position += used;
    }
}

void MidiHub::pushFromHost (const juce::MidiMessage& message) noexcept
{
    // Whole messages of any length. Notes and controllers are what actually arrive here — Live
    // never forwards sysex to a plugin — but nothing about this path needs to assume that.
    inbound.push (message.getRawData(), message.getRawDataSize());
}

void MidiHub::handleIncomingMidiMessage (juce::MidiInput* source, const juce::MidiMessage& message)
{
    TaggedMidi tagged;
    tagged.portId = source->getIdentifier();
    tagged.portName = source->getName();

    const auto* raw = message.getRawData();
    tagged.data.assign (raw, raw + message.getRawDataSize());

    const juce::ScopedLock sl (deviceLock);

    if (pending.size() < maxPending)
        pending.push_back (std::move (tagged));
}

void MidiHub::timerCallback()
{
    std::vector<TaggedMidi> batch;

    {
        const juce::ScopedLock sl (deviceLock);
        batch.swap (pending);
    }

    while (inbound.pop (timerScratch))
        batch.push_back ({ hostPortId, hostPortName, timerScratch });

    if (! batch.empty() && sink != nullptr)
        sink (batch);
}
