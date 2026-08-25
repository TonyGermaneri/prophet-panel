#pragma once

#include <juce_gui_extra/juce_gui_extra.h>

#include <memory>
#include <optional>
#include <vector>

#include "PluginProcessor.h"

/**
 * The panel, in a WebView.
 *
 * The same React app that runs at the public URL runs here, unmodified. Everything it cannot do
 * for itself inside a plugin — reach MIDI ports, keep settings, write a file — it asks for across
 * the bridge set up below.
 *
 * The editor is created and destroyed as the user opens and closes the window, so it owns nothing
 * that matters. Every piece of state worth keeping lives in the processor or on disk, which is
 * what lets the panel come back exactly as it was.
 */
class ProphetPanelEditor final : public juce::AudioProcessorEditor,
                                 private juce::Timer
{
public:
    explicit ProphetPanelEditor (ProphetPanelProcessor&);
    ~ProphetPanelEditor() override;

    void resized() override;

private:
    juce::WebBrowserComponent::Options makeOptions();
    void timerCallback() override;

    std::optional<juce::WebBrowserComponent::Resource> serve (const juce::String& url);
    void deliver (const std::vector<TaggedMidi>& batch);
    juce::var describePorts() const;

    ProphetPanelProcessor& processor;
    juce::WebBrowserComponent web;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ProphetPanelEditor)
};
