#include "PluginEditor.h"

#include "ProphetPanelWebUI.h"

namespace
{

/** Small enough for a laptop, large enough that the panel is still readable. */
constexpr int minWidth = 900;
constexpr int minHeight = 420;

juce::String toBase64 (const juce::uint8* data, size_t size)
{
    juce::MemoryOutputStream out;
    juce::Base64::convertToBase64 (out, data, size);
    return out.toString();
}

std::vector<juce::uint8> fromBase64 (const juce::String& text)
{
    juce::MemoryOutputStream out;

    if (! juce::Base64::convertFromBase64 (out, text))
        return {};

    const auto* bytes = static_cast<const juce::uint8*> (out.getData());
    return { bytes, bytes + out.getDataSize() };
}

juce::String argString (const juce::Array<juce::var>& args, int index)
{
    return index < args.size() ? args[index].toString() : juce::String();
}

/**
 * A WebView will not run a script served as octet-stream, so guessing wrong here is the difference
 * between a panel and a blank window.
 */
juce::String mimeFor (const juce::String& path)
{
    if (path.endsWithIgnoreCase (".html")) return "text/html";
    if (path.endsWithIgnoreCase (".js")) return "text/javascript";
    if (path.endsWithIgnoreCase (".css")) return "text/css";
    if (path.endsWithIgnoreCase (".svg")) return "image/svg+xml";
    if (path.endsWithIgnoreCase (".png")) return "image/png";
    if (path.endsWithIgnoreCase (".woff2")) return "font/woff2";
    if (path.endsWithIgnoreCase (".json") || path.endsWithIgnoreCase (".webmanifest"))
        return "application/json";

    // .syx and anything else: bytes are bytes.
    return "application/octet-stream";
}

juce::var portList (const juce::Array<juce::MidiDeviceInfo>& devices)
{
    juce::Array<juce::var> list;

    for (const auto& device : devices)
    {
        auto* entry = new juce::DynamicObject();
        entry->setProperty ("id", device.identifier);
        entry->setProperty ("name", device.name);
        list.add (juce::var (entry));
    }

    return { list };
}

} // namespace

std::unique_ptr<juce::ZipFile> ProphetPanelEditor::openBundle()
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

ProphetPanelEditor::ProphetPanelEditor (ProphetPanelProcessor& p)
    : juce::AudioProcessorEditor (&p),
      processor (p),
      bundle (openBundle()),
      web (makeOptions())
{
    // Read before anything else touches it. setResizeLimits ends by constraining the current
    // bounds, which on a component this new are 0x0 — so it snaps to the minimum, and that arrives
    // in the processor through resized(). Asking afterwards turns "nothing remembered" into
    // "remembered as the smallest allowed", and the window opens at 900x420 for ever after.
    const auto remembered = processor.getEditorSize();
    const auto hadRememberedSize = processor.hasEditorSize();

    addAndMakeVisible (web);

    setResizable (true, true);
    setResizeLimits (minWidth, minHeight, 4000, 2600);

    // Whatever it was left as, or a default the panel corrects once it has measured the instrument.
    if (hadRememberedSize)
        setSize (remembered.x, remembered.y);
    else
        setSize (1400, 760);

    processor.midi().setSink ([this] (const std::vector<TaggedMidi>& batch) { deliver (batch); });
    processor.midi().setPortsChanged ([this]
    {
        web.emitEventIfBrowserIsVisible ("pp:ports", describePorts());
    });

    web.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
}

ProphetPanelEditor::~ProphetPanelEditor()
{
    // The hub outlives the editor. Leaving these attached would call into a destroyed WebView on
    // the very next MIDI message.
    processor.midi().setSink (nullptr);
    processor.midi().setPortsChanged (nullptr);
}

void ProphetPanelEditor::resized()
{
    web.setBounds (getLocalBounds());

    // Every frame of a drag, which is two integers and no allocation. The processor holds it so it
    // outlives this window, and writes it into the session so it outlives the project.
    processor.setEditorSize (getWidth(), getHeight());
}

juce::var ProphetPanelEditor::describePorts() const
{
    auto* result = new juce::DynamicObject();
    result->setProperty ("inputs", portList (processor.midi().inputs()));
    result->setProperty ("outputs", portList (processor.midi().outputs()));
    return { result };
}

juce::WebBrowserComponent::Options ProphetPanelEditor::makeOptions()
{
    using Options = juce::WebBrowserComponent::Options;

    // Settings and the last patch are injected before the app's own scripts run, because the app
    // reads its settings during module initialisation — synchronously, long before it could await
    // anything across this bridge.
    const auto bootstrap = "window.__PROPHET__ = { kv: " + processor.storage().keyValueJson()
                         + ", session: " + juce::JSON::toString (juce::var (processor.getSessionPatch()))
                         // So the panel knows whether it may size the window to the instrument, or
                         // whether it is looking at a size the user chose and should leave alone.
                         + ", sizeRestored: " + (processor.hasEditorSize() ? "true" : "false")
                         + " };";

    auto options = Options {}
        .withNativeIntegrationEnabled()
        .withUserScript (bootstrap)
        .withResourceProvider ([this] (const juce::String& url) { return serve (url); });

#if JUCE_WINDOWS
    // WebView2 keeps a cache, and its default home is beside the running executable — which for a
    // plug-in is the host's own install directory, and is usually not writable. Left to default,
    // the WebView fails to create and the panel is a blank rectangle. Pointed at the same folder
    // the library already lives in, which exists and is ours.
    const auto webViewCache = processor.storage().directory().getChildFile ("WebView2");
    webViewCache.createDirectory();

    options = options
        .withBackend (Options::Backend::webview2)
        .withWinWebView2Options (Options::WinWebView2 {}.withUserDataFolder (webViewCache));
#endif

    return options
        .withNativeFunction ("midiOpen", [this] (const juce::Array<juce::var>&, auto complete)
        {
            // The var is held in a named local: it owns the DynamicObject, and reading the pointer
            // straight out of a temporary would leave it dangling before the first setProperty.
            auto ports = describePorts();

            if (auto* result = ports.getDynamicObject())
            {
                result->setProperty ("state", "ready");
                // Nothing gates sysex here the way a browser permission prompt does.
                result->setProperty ("sysexEnabled", true);
            }

            complete (ports);
        })

        .withNativeFunction ("resizeWindow", [this] (const juce::Array<juce::var>& args, auto complete)
        {
            const auto width = args.size() > 0 ? static_cast<int> (args[0]) : 0;
            const auto height = args.size() > 1 ? static_cast<int> (args[1]) : 0;

            if (width > 0 && height > 0)
            {
                // Asynchronously, because this arrives from inside a WebView callback and resizing
                // the component that owns it re-enters the browser's own layout.
                juce::Component::SafePointer<ProphetPanelEditor> safe { this };
                juce::MessageManager::callAsync ([safe, width, height]
                {
                    if (safe != nullptr)
                        safe->setSize (juce::jlimit (minWidth, 4000, width),
                                       juce::jlimit (minHeight, 2600, height));
                });
            }

            complete (juce::var());
        })

        .withNativeFunction ("midiPorts", [this] (const juce::Array<juce::var>&, auto complete)
        {
            complete (describePorts());
        })

        .withNativeFunction ("midiSend", [this] (const juce::Array<juce::var>& args, auto complete)
        {
            const auto bytes = fromBase64 (argString (args, 1));

            if (! bytes.empty())
                processor.midi().send (argString (args, 0), bytes.data(), bytes.size());

            complete (juce::var());
        })

        .withNativeFunction ("kvSet", [this] (const juce::Array<juce::var>& args, auto complete)
        {
            processor.storage().setKeyValue (argString (args, 0), argString (args, 1));
            complete (juce::var());
        })

        .withNativeFunction ("libLoad", [this] (const juce::Array<juce::var>&, auto complete)
        {
            complete (juce::var (processor.storage().readLibrary()));
        })

        .withNativeFunction ("libSave", [this] (const juce::Array<juce::var>& args, auto complete)
        {
            processor.storage().writeLibrary (argString (args, 0));
            complete (juce::var());
        })

        .withNativeFunction ("sessionSet", [this] (const juce::Array<juce::var>& args, auto complete)
        {
            processor.setSessionPatch (argString (args, 0));
            complete (juce::var());
        })

        .withNativeFunction ("saveFile", [this] (const juce::Array<juce::var>& args, auto complete)
        {
            const auto name = argString (args, 0);
            const auto bytes = fromBase64 (argString (args, 1));

            auto chooser = std::make_shared<juce::FileChooser> (
                "Export", juce::File::getSpecialLocation (juce::File::userMusicDirectory)
                              .getChildFile (name), "*");

            // The chooser is kept alive by the callback's capture: it must outlive this call, and
            // the dialog is asynchronous.
            chooser->launchAsync (juce::FileBrowserComponent::saveMode
                                      | juce::FileBrowserComponent::canSelectFiles
                                      | juce::FileBrowserComponent::warnAboutOverwriting,
                                  [chooser, bytes, complete] (const juce::FileChooser& fc)
                                  {
                                      const auto file = fc.getResult();

                                      if (file == juce::File() || bytes.empty())
                                      {
                                          complete (juce::var());
                                          return;
                                      }

                                      file.replaceWithData (bytes.data(), bytes.size());
                                      complete (juce::var (file.getFullPathName()));
                                  });
        });
}

std::optional<juce::WebBrowserComponent::Resource> ProphetPanelEditor::serve (const juce::String& url)
{
    if (bundle == nullptr)
        return std::nullopt;

    auto path = url.upToFirstOccurrenceOf ("?", false, false);

    // The resource provider is addressed as `juce://juce.backend/...` on Apple platforms and
    // `https://juce.backend/...` on Windows, and a bare path arrives on some. Take whatever follows
    // the host when there is one, and leave a bare path alone.
    //
    // Written with indexOf rather than fromFirstOccurrenceOf, which returns an *empty* string when
    // the substring is absent rather than the original. That is what reduced every bare path to
    // nothing here, so the fallback below answered every request — scripts included — with
    // index.html, and the panel was a blank white rectangle that still passed auval and pluginval.
    const auto scheme = path.indexOf ("://");

    if (scheme >= 0)
    {
        const auto host = path.substring (scheme + 3);
        const auto slash = host.indexOfChar ('/');
        path = slash >= 0 ? host.substring (slash) : juce::String();
    }

    path = path.startsWith ("/") ? path.substring (1) : path;

    // The factory banks are named "Prophet-10 Factory Group 01.syx", so the WebView asks for them
    // percent-encoded. Matching those against the zip's real entry names without decoding first
    // would 404 every bank and leave the library silently empty.
    path = juce::URL::removeEscapeChars (path);

    if (path.isEmpty())
        path = "index.html";

    auto index = bundle->getIndexOfFileName (path);

    // `cmake -E tar` zips the working directory as ".", so every entry carries a "./" prefix.
    if (index < 0)
        index = bundle->getIndexOfFileName ("./" + path);

    if (index < 0)
        return std::nullopt;

    const std::unique_ptr<juce::InputStream> stream (bundle->createStreamForEntry (index));

    if (stream == nullptr)
        return std::nullopt;

    juce::MemoryBlock block;
    stream->readIntoMemoryBlock (block);

    const auto* bytes = static_cast<const std::byte*> (block.getData());

    return juce::WebBrowserComponent::Resource {
        std::vector<std::byte> (bytes, bytes + block.getSize()), mimeFor (path)
    };
}

void ProphetPanelEditor::deliver (const std::vector<TaggedMidi>& batch)
{
    juce::Array<juce::var> messages;
    messages.ensureStorageAllocated (static_cast<int> (batch.size()));

    for (const auto& message : batch)
    {
        auto* entry = new juce::DynamicObject();
        entry->setProperty ("port", message.portId);
        entry->setProperty ("name", message.portName);
        entry->setProperty ("data", toBase64 (message.data.data(), message.data.size()));
        messages.add (juce::var (entry));
    }

    // One event per tick rather than per message: a 400-program dump is thousands of messages, and
    // crossing the bridge that many times would stall the panel for the length of the transfer.
    web.emitEventIfBrowserIsVisible ("pp:midi", juce::var (messages));
}
