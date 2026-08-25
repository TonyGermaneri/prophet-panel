#pragma once

#include <juce_core/juce_core.h>

#include <memory>

/**
 * The built web app, embedded in the binary as one zip.
 *
 * Opened by the editor to serve the panel, and by the processor to read the parameter manifest —
 * which it must do in its constructor, before there is any editor to ask.
 */
std::unique_ptr<juce::ZipFile> openWebBundle();

/** The bytes of one entry, or an empty block if the bundle has no such path. */
juce::MemoryBlock readWebBundleEntry (juce::ZipFile& bundle, const juce::String& path);
