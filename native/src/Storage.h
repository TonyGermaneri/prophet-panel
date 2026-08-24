#pragma once

#include <juce_core/juce_core.h>
#include <juce_data_structures/juce_data_structures.h>

#include <memory>

/**
 * Where the plugin keeps things.
 *
 * The WebView is served from a custom scheme, and a custom scheme's origin is not one the browser
 * will reliably grant durable storage to — localStorage and IndexedDB may or may not survive,
 * depending on the OS version. So neither is trusted. Settings and the patch library live in
 * Application Support instead, which also means they outlive a host clearing its WebView data and
 * are shared by every DAW on the machine.
 */
class Storage
{
public:
    Storage();

    /** The whole settings map as a JSON object, for injection ahead of the app's first script. */
    juce::String keyValueJson() const;
    void setKeyValue (const juce::String& key, const juce::String& value);

    /** The patch library as one opaque document. Its schema belongs to the app, not to here. */
    juce::String readLibrary() const;
    void writeLibrary (const juce::String& json);

private:
    std::unique_ptr<juce::PropertiesFile> settings;
    juce::File libraryFile;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (Storage)
};
