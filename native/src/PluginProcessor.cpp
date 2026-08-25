#include "PluginProcessor.h"

#include "PluginEditor.h"
#include "WebBundle.h"

namespace
{
constexpr const char* stateTag = "ProphetPanelState";
} // namespace

ProphetPanelProcessor::ProphetPanelProcessor()
    : juce::AudioProcessor (BusesProperties()
                                .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                                .withOutput ("Output", juce::AudioChannelSet::stereo(), true))
{
    // Before anything else: a host asks for the parameter list the moment it instantiates, and
    // there is no second chance to declare one.
    bundle = openWebBundle();
    createPanelParameters();

    // Started with the plugin rather than with the window, so the panel is live the moment it is
    // shown instead of spending its first second enumerating hardware.
    hub.start();
}

/**
 * Every control, read from the manifest the web build emitted beside the bundle.
 *
 * Order is the manifest's order and must stay that way: a host stores automation against a
 * parameter's index, so reordering this list rewires every lane in every session already saved.
 */
void ProphetPanelProcessor::createPanelParameters()
{
    if (bundle == nullptr)
        return;

    const auto raw = readWebBundleEntry (*bundle, "parameters.json");

    if (raw.getSize() == 0)
        return;

    const auto parsed = juce::JSON::parse (
        juce::String::createStringFromData (raw.getData(), static_cast<int> (raw.getSize())));

    const auto* list = parsed.getArray();

    if (list == nullptr)
        return;

    for (const auto& entry : *list)
    {
        const auto id = entry["id"].toString();
        const auto label = entry["label"].toString();
        const auto minimum = static_cast<int> (entry["min"]);
        const auto maximum = static_cast<int> (entry["max"]);

        if (id.isEmpty() || maximum <= minimum)
            continue;

        auto held = std::make_unique<PanelParameter>();
        held->id = id;

        // AudioParameterInt for everything, triggers included. The values this instrument takes are
        // whole numbers with small ranges, and a host draws those as steps rather than as a
        // continuum that happens to land on integers.
        auto parameter = std::make_unique<juce::AudioParameterInt> (
            juce::ParameterID { id, 1 }, label, minimum, maximum, minimum);

        held->parameter = parameter.get();
        parameter->addListener (this);

        addParameter (parameter.release());
        panelParams.push_back (std::move (held));
    }
}

void ProphetPanelProcessor::parameterValueChanged (int parameterIndex, float)
{
    if (parameterIndex < 0 || parameterIndex >= static_cast<int> (panelParams.size()))
        return;

    auto& held = *panelParams[static_cast<size_t> (parameterIndex)];

    // The panel's own write, arriving back. Dropping it here saves a pointless round trip; the
    // store would discard it anyway, since it ignores a set to the value it already holds.
    if (held.writingFromPanel.load (std::memory_order_acquire))
        return;

    // Called on whatever thread the host changed it on, the audio thread included, so this does
    // nothing but raise a flag. The editor's timer does the talking.
    held.dirty.store (true, std::memory_order_release);
}

void ProphetPanelProcessor::setFromPanel (const juce::String& id, int value)
{
    for (auto& held : panelParams)
    {
        if (held->id != id)
            continue;

        held->writingFromPanel.store (true, std::memory_order_release);
        // NotifyingHost, or a knob moved on the panel would never be recorded into an
        // automation lane — which is most of what automation is for.
        held->parameter->setValueNotifyingHost (held->parameter->convertTo0to1 (static_cast<float> (value)));
        held->writingFromPanel.store (false, std::memory_order_release);
        return;
    }
}

ProphetPanelProcessor::~ProphetPanelProcessor()
{
    hub.stop();
}

bool ProphetPanelProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto& out = layouts.getMainOutputChannelSet();

    if (out != juce::AudioChannelSet::mono() && out != juce::AudioChannelSet::stereo())
        return false;

    // Audio is carried through rather than processed, so anything but a matching pair would leave
    // channels with nothing to carry.
    return layouts.getMainInputChannelSet() == out;
}

void ProphetPanelProcessor::processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;

    // The host's MIDI is offered to the panel as one more input port, so a track can play the
    // Prophet through the panel's existing controller pass-through.
    for (const auto metadata : midi)
        hub.pushFromHost (metadata.getMessage());

    // Audio passes through untouched, which is the whole reason this is an effect: the Prophet's
    // outputs arrive on the track and leave on the track, and the panel sits in that path without
    // displacing whatever brought the audio in. Only channels with no input to carry are cleared.
    for (auto channel = getTotalNumInputChannels(); channel < getTotalNumOutputChannels(); ++channel)
        audio.clear (channel, 0, audio.getNumSamples());
}

juce::AudioProcessorEditor* ProphetPanelProcessor::createEditor()
{
    return new ProphetPanelEditor (*this);
}

void ProphetPanelProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    juce::XmlElement xml (stateTag);
    xml.setAttribute ("patch", sessionPatch);
    xml.setAttribute ("editorWidth", editorWidth);
    xml.setAttribute ("editorHeight", editorHeight);
    copyXmlToBinary (xml, destData);
}

void ProphetPanelProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary (data, sizeInBytes))
        if (xml->hasTagName (stateTag))
        {
            sessionPatch = xml->getStringAttribute ("patch");
            editorWidth = xml->getIntAttribute ("editorWidth", 0);
            editorHeight = xml->getIntAttribute ("editorHeight", 0);
        }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new ProphetPanelProcessor();
}
