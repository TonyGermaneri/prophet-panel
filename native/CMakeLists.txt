# The plugin build target.
#
# This does not build the app — Vite does, into native/webui — it wraps it. `npm run build:plugin`
# emits the web bundle; this zips that directory, embeds the zip in the binary, and serves it to a
# WebView from inside the plugin. The web build is untouched by any of it.

cmake_minimum_required(VERSION 3.22)

# Both of these must come before project(), and it is not a style point. CMake fixes the target
# platform while processing project(); a value set afterwards lands in the cache too late to affect
# anything, silently. Set after project(), this produced x86_64-only binaries on an Apple silicon
# machine — which load only under Rosetta, and are invisible to an arm64 host.
#
# CACHE without FORCE, so -DCMAKE_OSX_ARCHITECTURES=arm64 on the command line still wins. Ignored
# on platforms that are not Apple.
set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "Build a universal binary")
set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "Oldest macOS supported")

project(ProphetPanel VERSION 0.1.1 LANGUAGES C CXX)

# Installing into the user's plug-in folders is what you want on a development machine and never
# what you want on a build runner, which has no one to install for.
option(PROPHET_COPY_PLUGIN "Copy the built plug-ins into the user plug-in folders" ON)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# JUCE is fetched rather than vendored, so the repository stays a web project with a build target
# bolted on rather than a C++ project with a web app inside it. Pinned, because a plugin that
# silently changes framework version between builds is not reproducible.
include(FetchContent)
FetchContent_Declare(JUCE
  GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
  GIT_TAG        9.0.1
  GIT_SHALLOW    TRUE)
FetchContent_MakeAvailable(JUCE)

# ---------------------------------------------------------------------------------------------
# The web bundle, as one embedded zip.
#
# Embedding the directory file-by-file would work, but juce_add_binary_data flattens paths to
# mangled identifiers, so serving "assets/index-abc.js" would mean matching on basename and hoping
# it stays unique. A zip keeps the real paths, looks them up exactly, and compresses.
# ---------------------------------------------------------------------------------------------
set(WEBUI_DIR "${CMAKE_CURRENT_SOURCE_DIR}/webui")
set(WEBUI_ZIP "${CMAKE_CURRENT_BINARY_DIR}/webui.zip")

if(NOT EXISTS "${WEBUI_DIR}/index.html")
  message(FATAL_ERROR
    "native/webui/index.html is missing. Run `npm run build:plugin` before configuring CMake.")
endif()

file(GLOB_RECURSE WEBUI_SOURCES CONFIGURE_DEPENDS "${WEBUI_DIR}/*")

add_custom_command(
  OUTPUT  "${WEBUI_ZIP}"
  COMMAND ${CMAKE_COMMAND} -E rm -f "${WEBUI_ZIP}"
  COMMAND ${CMAKE_COMMAND} -E tar "cf" "${WEBUI_ZIP}" --format=zip -- .
  WORKING_DIRECTORY "${WEBUI_DIR}"
  DEPENDS ${WEBUI_SOURCES}
  COMMENT "Packing web UI into ${WEBUI_ZIP}"
  VERBATIM)

add_custom_target(ProphetPanelWebUIZip DEPENDS "${WEBUI_ZIP}")

juce_add_binary_data(ProphetPanelWebUI
  HEADER_NAME ProphetPanelWebUI.h
  NAMESPACE   webui
  SOURCES     "${WEBUI_ZIP}")

add_dependencies(ProphetPanelWebUI ProphetPanelWebUIZip)

# ---------------------------------------------------------------------------------------------
# The plugin.
#
# An effect, so that the instrument's audio can pass through it.
#
# It was briefly an instrument, because hosts deliver MIDI only to instruments. That turned out to
# cost more than it bought: an instrument owns the one instrument slot on a track, which is the slot
# Ableton's External Instrument needs in order to bring hardware audio back in. An effect sits after
# whatever does that and passes the audio along, which is the arrangement people actually want.
#
# Losing host MIDI costs nothing here, because the synth was never driven that way. The plug-in
# opens the Prophet's port itself — Live does not pass sysex to plug-ins under any circumstances, so
# patch transfer could never have gone through the host — and MIDI input stays declared for the
# hosts that do deliver it to effects.
#
# IS_MIDI_EFFECT is never set: it makes Ableton refuse to load the plug-in at all.
# ---------------------------------------------------------------------------------------------
juce_add_plugin(ProphetPanel
  COMPANY_NAME              "WaveContour"
  BUNDLE_ID                 "dev.ProphetPanel"
  PLUGIN_MANUFACTURER_CODE  WvCt
  PLUGIN_CODE               PrPl
  FORMATS                   AU VST3 Standalone
  PRODUCT_NAME              "Prophet Panel"
  IS_SYNTH                  FALSE
  IS_MIDI_EFFECT            FALSE
  NEEDS_MIDI_INPUT          TRUE
  NEEDS_MIDI_OUTPUT         FALSE
  NEEDS_WEB_BROWSER         TRUE
  NEEDS_WEBVIEW2            TRUE   # Windows: the Edge WebView2 loader, fetched as a NuGet package
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE   # the panel plays notes from the computer keyboard
  COPY_PLUGIN_AFTER_BUILD   ${PROPHET_COPY_PLUGIN})

target_sources(ProphetPanel PRIVATE
  src/MidiHub.cpp
  src/Storage.cpp
  src/PluginProcessor.cpp
  src/PluginEditor.cpp)

target_compile_definitions(ProphetPanel PUBLIC
  JUCE_WEB_BROWSER=1
  JUCE_USE_CURL=0
  JUCE_VST3_CAN_REPLACE_VST2=0
  JUCE_DISPLAY_SPLASH_SCREEN=0
  JUCE_REPORT_APP_USAGE=0)

if(WIN32)
  # Statically linked so the plug-in is one file. The alternative ships WebView2Loader.dll beside
  # it, which survives a zip and does not survive a user dragging only the .vst3 into their folder.
  target_compile_definitions(ProphetPanel PUBLIC
    JUCE_USE_WIN_WEBVIEW2=1
    JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1)
endif()

target_link_libraries(ProphetPanel PRIVATE
  ProphetPanelWebUI
  juce::juce_audio_utils
  juce::juce_gui_extra
  PUBLIC
  juce::juce_recommended_config_flags
  juce::juce_recommended_lto_flags
  juce::juce_recommended_warning_flags)
