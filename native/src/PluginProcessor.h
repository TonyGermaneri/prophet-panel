#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include "MidiHub.h"
#include "Storage.h"

/**
 * The plugin.
 *
 * There is no audio here and there never will be: the instrument this controls is a hardware
 * synthesizer on the other end of a MIDI cable. What the processor exists to do is own the things
 * that must outlive the editor window — the MIDI ports, the settings, the library — and hand the
 * host's MIDI stream to the panel.
 *
 * It declares itself an instrument, which is untrue and unavoidable: hosts deliver MIDI only to
 * instruments, so an effect would sit on a track and never hear a note. It generates silence.
 */
class ProphetPanelProcessor final : public juce::AudioProcessor
{
public:
    ProphetPanelProcessor();
    ~ProphetPanelProcessor() override;

    void prepareToPlay (double, int) override {}
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout&) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "Prophet Panel"; }
    bool acceptsMidi() const override { return true; }
    /** Nothing goes back to the host: the synth is reached through the plugin's own port. */
    bool producesMidi() const override { return false; }
    /** Never true: it makes Ableton refuse to load the plugin outright. */
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock&) override;
    void setStateInformation (const void*, int) override;

    MidiHub& midi() { return hub; }
    Storage& storage() { return store; }

    /** The panel's current patch, so a reopened session comes back on the same sound. */
    void setSessionPatch (juce::String base64) { sessionPatch = std::move (base64); }
    const juce::String& getSessionPatch() const { return sessionPatch; }

private:
    MidiHub hub;
    Storage store;

    /** The 133-byte payload, base64'd. Small enough to keep in the host's session file. */
    juce::String sessionPatch;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ProphetPanelProcessor)
};
