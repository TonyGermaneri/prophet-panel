#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

#include <atomic>
#include <memory>
#include <vector>

#include "MidiHub.h"
#include "Storage.h"

/**
 * One control the host can automate.
 *
 * `dirty` is set from whichever thread the host changed the value on — including the audio thread —
 * and cleared once the panel has been told. Two atomics rather than a queue because the interesting
 * value is always the latest one: an automation lane sweeping a knob produces a value per block,
 * and every one of them except the last is already stale by the time the panel could draw it.
 */
struct PanelParameter
{
    juce::String id;
    juce::AudioParameterInt* parameter = nullptr;
    std::atomic<bool> dirty { false };

    /** Set while the panel is the one writing, so its own change does not come straight back. */
    std::atomic<bool> writingFromPanel { false };
};

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
class ProphetPanelProcessor final : public juce::AudioProcessor,
                                    private juce::AudioProcessorParameter::Listener
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

    /** Everything the host can automate, in the order the manifest declared it. */
    const std::vector<std::unique_ptr<PanelParameter>>& panelParameters() const { return panelParams; }

    /** A change the panel made. Told to the host so it records, without being told back. */
    void setFromPanel (const juce::String& id, int value);

    /** The embedded web app. Owned here because the manifest is read before any editor exists. */
    juce::ZipFile* webBundle() const { return bundle.get(); }

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
    void parameterValueChanged (int parameterIndex, float newValue) override;
    void parameterGestureChanged (int, bool) override {}

    void createPanelParameters();

    std::unique_ptr<juce::ZipFile> bundle;
    std::vector<std::unique_ptr<PanelParameter>> panelParams;

    MidiHub hub;
    Storage store;

    /** The 133-byte payload, base64'd. Small enough to keep in the host's session file. */
    juce::String sessionPatch;

    int editorWidth = 0;
    int editorHeight = 0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ProphetPanelProcessor)
};
