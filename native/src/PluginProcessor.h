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
 * It is an effect so that audio can pass through it untouched — the Prophet's own outputs, arriving
 * on whatever track the panel has been put on. It adds nothing to them and takes nothing away.
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

    /**
     * The editor's last size. Held here rather than in the editor because the editor is destroyed
     * every time the window closes, and travels in the session state so a reopened project comes
     * back the shape it was left. Zero means nothing has been remembered yet.
     */
    void setEditorSize (int w, int h) { editorWidth = w; editorHeight = h; }
    juce::Point<int> getEditorSize() const { return { editorWidth, editorHeight }; }
    bool hasEditorSize() const { return editorWidth > 0 && editorHeight > 0; }

private:
    MidiHub hub;
    Storage store;

    /** The 133-byte payload, base64'd. Small enough to keep in the host's session file. */
    juce::String sessionPatch;

    int editorWidth = 0;
    int editorHeight = 0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ProphetPanelProcessor)
};
