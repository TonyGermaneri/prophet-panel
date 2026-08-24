#pragma once

#include <juce_audio_devices/juce_audio_devices.h>

#include <cstring>
#include <functional>
#include <map>
#include <memory>
#include <vector>

/** One incoming MIDI message, tagged with the port it arrived on. */
struct TaggedMidi
{
    juce::String portId;
    juce::String portName;
    std::vector<juce::uint8> data;
};

/**
 * A lock-free queue of whole MIDI messages, for the one crossing that has a realtime end.
 *
 * Messages are length-prefixed and written in a single reservation, so a reader can never observe
 * a header whose body has not landed yet. Sysex is why this exists at all: patch dumps are far too
 * long for a fixed-size slot, and in a DAW they travel this way in both directions.
 */
class MidiFifo
{
public:
    explicit MidiFifo (int capacity) : fifo (capacity), buffer ((size_t) capacity) {}

    /** Producer side. Returns false if the message will not fit, in which case it is dropped. */
    bool push (const juce::uint8* data, int size) noexcept
    {
        const int needed = size + 2;

        if (size <= 0 || size > 0xffff || fifo.getFreeSpace() < needed)
            return false;

        int start1 = 0, block1 = 0, start2 = 0, block2 = 0;
        fifo.prepareToWrite (needed, start1, block1, start2, block2);

        const juce::uint8 header[2] { (juce::uint8) (size >> 8), (juce::uint8) (size & 0xff) };

        for (int i = 0; i < needed; ++i)
            buffer[(size_t) (i < block1 ? start1 + i : start2 + (i - block1))]
                = i < 2 ? header[i] : data[i - 2];

        fifo.finishedWrite (needed);
        return true;
    }

    /** Consumer side. `out` must already have the capacity to take a message, or this allocates. */
    bool pop (std::vector<juce::uint8>& out) noexcept
    {
        if (fifo.getNumReady() < 2)
            return false;

        int start1 = 0, block1 = 0, start2 = 0, block2 = 0;

        // Peek the length first. prepareToRead does not consume, so a message whose body is still
        // being written is simply left alone until the next drain.
        fifo.prepareToRead (2, start1, block1, start2, block2);
        const int size = (buffer[(size_t) start1] << 8)
                       | buffer[(size_t) (block1 > 1 ? start1 + 1 : start2)];

        if (fifo.getNumReady() < size + 2)
            return false;

        fifo.finishedRead (2);

        fifo.prepareToRead (size, start1, block1, start2, block2);
        out.resize ((size_t) size);
        if (block1 > 0) std::memcpy (out.data(), buffer.data() + start1, (size_t) block1);
        if (block2 > 0) std::memcpy (out.data() + block1, buffer.data() + start2, (size_t) block2);
        fifo.finishedRead (block1 + block2);

        return true;
    }

private:
    juce::AbstractFifo fifo;
    std::vector<juce::uint8> buffer;
};

/**
 * Every MIDI port on the machine, plus the host.
 *
 * The synth is reached through a port this opens directly, in the plugin exactly as in the browser.
 * That is not a preference: Ableton Live does not deliver sysex to plugins at all, so a patch dump
 * routed through a host would simply never arrive, and the librarian would be decorative. Driving
 * the instrument over its own port is also what the established editors for this hardware do.
 *
 * Every input is opened rather than just the chosen one, because MIDI learn has to be able to hear
 * a controller that is not the synth. The host's own stream joins that list as one more input, so a
 * DAW track can play the Prophet through the panel's existing pass-through.
 */
class MidiHub final : private juce::MidiInputCallback,
                      private juce::Timer
{
public:
    /** Called on the message thread with everything that arrived since the last tick. */
    using Sink = std::function<void (const std::vector<TaggedMidi>&)>;
    using PortsChangedFn = std::function<void()>;

    static const juce::String hostPortId;
    static const juce::String hostPortName;

    MidiHub();
    ~MidiHub() override;

    void start();
    void stop();

    juce::Array<juce::MidiDeviceInfo> inputs() const;
    juce::Array<juce::MidiDeviceInfo> outputs() const;

    void send (const juce::String& outputId, const juce::uint8* data, size_t size);

    /** Host MIDI in, from processBlock. Realtime: never allocates, never locks. */
    void pushFromHost (const juce::MidiMessage& message) noexcept;

    void setSink (Sink s) { sink = std::move (s); }
    void setPortsChanged (PortsChangedFn f) { portsChangedFn = std::move (f); }

private:
    void handleIncomingMidiMessage (juce::MidiInput*, const juce::MidiMessage&) override;
    void timerCallback() override;
    void refreshDevices();

    // Sized for a burst rather than a message, so a run of messages from the host cannot lose its
    // tail while the panel is between drains.
    static constexpr int fifoCapacity = 1 << 18;
    static constexpr int scratchReserve = 1 << 14;

    MidiFifo inbound { fifoCapacity };       // audio thread -> timer
    std::vector<juce::uint8> timerScratch;   // touched only by the timer

    // Device messages arrive on MIDI threads, which carry no realtime deadline, so a short lock is
    // the simplest correct thing.
    juce::CriticalSection deviceLock;
    std::vector<TaggedMidi> pending;

    std::map<juce::String, std::unique_ptr<juce::MidiInput>> openInputs;
    std::map<juce::String, std::unique_ptr<juce::MidiOutput>> openOutputs;

    Sink sink;
    PortsChangedFn portsChangedFn;

    juce::MidiDeviceListConnection deviceListConnection;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MidiHub)
};
