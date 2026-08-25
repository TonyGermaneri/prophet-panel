#include "PluginProcessor.h"

#include "PluginEditor.h"

namespace
{
constexpr const char* stateTag = "ProphetPanelState";
} // namespace

ProphetPanelProcessor::ProphetPanelProcessor()
    : juce::AudioProcessor (BusesProperties()
                                .withOutput ("Output", juce::AudioChannelSet::stereo(), true))
{
    // Started with the plugin rather than with the window, so the panel is live the moment it is
    // shown instead of spending its first second enumerating hardware.
    hub.start();
}

ProphetPanelProcessor::~ProphetPanelProcessor()
{
    hub.stop();
}

bool ProphetPanelProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto& out = layouts.getMainOutputChannelSet();
    return out == juce::AudioChannelSet::mono() || out == juce::AudioChannelSet::stereo();
}

void ProphetPanelProcessor::processBlock (juce::AudioBuffer<float>& audio, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;

    // The host's MIDI is offered to the panel as one more input port, so a track can play the
    // Prophet through the panel's existing controller pass-through.
    for (const auto metadata : midi)
        hub.pushFromHost (metadata.getMessage());

    // An instrument that is not one. The sound is coming from the hardware, not from here.
    audio.clear();
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
