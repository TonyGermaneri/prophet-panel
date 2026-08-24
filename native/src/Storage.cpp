#include "Storage.h"

namespace
{
constexpr const char* appFolder = "Prophet Panel";
} // namespace

Storage::Storage()
{
    // PropertiesFile rather than a hand-rolled JSON map: the app's keys ("prophet-panel:settings")
    // are not valid juce::Identifiers, which rules out DynamicObject, and this handles atomic
    // writes and the platform's conventional location for free.
    juce::PropertiesFile::Options options;
    options.applicationName = appFolder;
    options.filenameSuffix = ".settings";
    options.folderName = appFolder;
    options.osxLibrarySubFolder = "Application Support";

    settings = std::make_unique<juce::PropertiesFile> (options);

    libraryFile = settings->getFile().getSiblingFile ("library.json");

    // PropertiesFile creates the folder when it first saves, which may be long after the library
    // wants to write — and a write into a folder that does not exist fails silently, losing the
    // whole library rather than one setting.
    libraryFile.getParentDirectory().createDirectory();
}

juce::String Storage::keyValueJson() const
{
    const auto& all = settings->getAllProperties();
    const auto& keys = all.getAllKeys();
    const auto& values = all.getAllValues();

    juce::StringArray parts;

    for (int i = 0; i < keys.size(); ++i)
    {
        // Both sides go through JSON::toString so quoting and escaping are the parser's problem
        // rather than ours — the values are arbitrary JSON documents the app wrote.
        parts.add (juce::JSON::toString (juce::var (keys[i])) + ":"
                   + juce::JSON::toString (juce::var (values[i])));
    }

    return "{" + parts.joinIntoString (",") + "}";
}

void Storage::setKeyValue (const juce::String& key, const juce::String& value)
{
    settings->setValue (key, value);
    settings->saveIfNeeded();
}

juce::String Storage::readLibrary() const
{
    return libraryFile.existsAsFile() ? libraryFile.loadFileAsString() : juce::String();
}

void Storage::writeLibrary (const juce::String& json)
{
    // Written through a temporary so an interrupted save cannot leave a truncated library behind.
    juce::TemporaryFile temp (libraryFile);

    if (temp.getFile().replaceWithText (json))
        temp.overwriteTargetFileWithTemporary();
}
