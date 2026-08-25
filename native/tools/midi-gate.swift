//
// What the plug-in actually puts on the wire.
//
// Every MIDI fault this project has had lived here, downstream of code that was correct: an NRPN
// handed to CoreMIDI as one malformed twelve-byte message, and a sysex parser reading the byte
// after F0 as a length field, which cost the device inquiry its 7E and every patch write its
// manufacturer ID. The unit tests never saw either, because the encoders produced the right bytes
// both times. auval and pluginval never saw them either; neither has any opinion about content.
//
// So this publishes a virtual destination, points the panel at it, and reads what arrives.
//
//   midi-gate <seconds>
//
// Exits 0 if the panel said what it should, 1 otherwise, naming what differed and dumping whatever
// did arrive — "nothing came" and "something came and was wrong" are different problems.
//
// It checks the device inquiry, which the panel sends unprompted the moment it connects. It does
// not yet check an NRPN, which would need a control to move, and driving one from a synthetic
// controller did not work: the injected control change reaches other listeners on the virtual
// source but never moves the panel. That is a gap in this harness rather than in the plug-in —
// correct four-message NRPN output has been confirmed by hand, from the standalone and from inside
// Ableton — and it is worth closing by driving the panel's own control directly rather than
// through the binding layer.

import CoreMIDI
import Foundation

let timeout = CommandLine.arguments.count > 1 ? Double(CommandLine.arguments[1])! : 60

// Fixed, because JUCE derives a virtual port's identifier from it — so the settings seeded before
// this runs can name the port without having to discover it first.
let outputUniqueID: Int32 = 770_002

func hex(_ bytes: [UInt8]) -> String { bytes.map { String(format: "%02X", $0) }.joined(separator: " ") }

var client = MIDIClientRef()
MIDIClientCreate("prophet-midi-gate" as CFString, nil, nil, &client)

let lock = NSLock()
var received: [[UInt8]] = []

var sink = MIDIEndpointRef()
guard MIDIDestinationCreateWithBlock(client, "Gate Out" as CFString, &sink, { list, _ in
    for packet in list.unsafeSequence() {
        let length = Int(packet.pointee.length)
        var bytes = [UInt8]()
        withUnsafeBytes(of: packet.pointee.data) { raw in
            for i in 0 ..< min(length, 256) { bytes.append(raw[i]) }
        }
        lock.lock(); received.append(bytes); lock.unlock()
    }
}) == noErr else { print("::error::could not publish the destination"); exit(1) }

// Checked: a rejected unique ID leaves the endpoint with one nobody can predict, and the settings
// written around it would then name a port that does not exist.
guard MIDIObjectSetIntegerProperty(sink, kMIDIPropertyUniqueID, outputUniqueID) == noErr else {
    print("::error::could not set the destination's unique ID"); exit(1)
}

print("published 'Gate Out'; waiting up to \(Int(timeout))s for the panel")

// Sysex arrives split across packets, so the stream is reassembled rather than read packet by packet.
func sysexMessages() -> [[UInt8]] {
    lock.lock(); let stream = received.flatMap { $0 }; lock.unlock()

    var messages: [[UInt8]] = []
    var current: [UInt8] = []
    var inside = false

    for byte in stream {
        if byte == 0xF0 { inside = true; current = [] }
        if inside { current.append(byte) }
        if byte == 0xF7, inside { messages.append(current); inside = false }
    }
    return messages
}

let deadline = Date().addingTimeInterval(timeout)
while Date() < deadline && sysexMessages().isEmpty {
    RunLoop.current.run(until: Date().addingTimeInterval(0.25))
}

let expected: [UInt8] = [0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7]
let found = sysexMessages()

if let inquiry = found.first, inquiry == expected {
    print("device inquiry: \(hex(expected)) — correct")
    print("MIDI gate passed")
    exit(0)
}

if let inquiry = found.first {
    print("::error::device inquiry was \(hex(inquiry)), expected \(hex(expected))")
} else {
    print("::error::the panel sent no sysex at all within \(Int(timeout))s")
}

lock.lock(); let everything = received; lock.unlock()
print("--- everything received (\(everything.count) message(s)) ---")
for message in everything { print("    \(hex(message))") }
exit(1)
