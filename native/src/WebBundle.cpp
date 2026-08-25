#include "WebBundle.h"

#include "ProphetPanelWebUI.h"

std::unique_ptr<juce::ZipFile> openWebBundle()
{
    if (webui::namedResourceListSize <= 0)
        return nullptr;

    int size = 0;
    const auto* data = webui::getNamedResource (webui::namedResourceList[0], size);

    if (data == nullptr || size <= 0)
        return nullptr;

    return std::make_unique<juce::ZipFile> (
        new juce::MemoryInputStream (data, static_cast<size_t> (size), false), true);
}

juce::MemoryBlock readWebBundleEntry (juce::ZipFile& bundle, const juce::String& path)
{
    auto index = bundle.getIndexOfFileName (path);

    // `cmake -E tar` zips the working directory as ".", so entries can carry a "./" prefix.
    if (index < 0)
        index = bundle.getIndexOfFileName ("./" + path);

    if (index < 0)
        return {};

    const std::unique_ptr<juce::InputStream> stream (bundle.createStreamForEntry (index));

    if (stream == nullptr)
        return {};

    juce::MemoryBlock block;
    stream->readIntoMemoryBlock (block);
    return block;
}
