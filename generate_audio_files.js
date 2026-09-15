const fs = require('fs');
const path = require('path');

const sampleRate = 44100;

function createWavBuffer(samples) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = samples.length * (bitsPerSample / 8);
    const chunkSize = 36 + dataSize;

    const buffer = Buffer.alloc(44 + dataSize);
    
    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(chunkSize, 4);
    buffer.write('WAVE', 8);

    // fmt subchunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);

    // data subchunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    for (let i = 0; i < samples.length; i++) {
        const val = Math.max(-1, Math.min(1, samples[i]));
        const intVal = val < 0 ? val * 0x8000 : val * 0x7FFF;
        buffer.writeInt16LE(Math.floor(intVal), 44 + i * 2);
    }

    return buffer;
}

function generateToneSequence(notes, totalDurationSec) {
    const totalSamples = Math.ceil(totalDurationSec * sampleRate);
    const samples = new Float32Array(totalSamples);

    notes.forEach(note => {
        const startSample = Math.floor(note.start * sampleRate);
        const durationSamples = Math.floor(note.duration * sampleRate);
        const endSample = Math.min(totalSamples, startSample + durationSamples);
        const freq = note.freq;

        for (let i = startSample; i < endSample; i++) {
            const t = (i - startSample) / sampleRate;
            const noteProgress = (i - startSample) / durationSamples;
            
            // Envelope: 10ms attack, exponential-like decay
            let envelope = 1;
            const attackTime = 0.01;
            if (t < attackTime) {
                envelope = t / attackTime;
            } else {
                envelope = Math.pow(1 - noteProgress, 1.5);
            }

            const volume = (note.volume || 0.4) * envelope;
            samples[i] += Math.sin(2 * Math.PI * freq * t) * volume;
        }
    });

    return samples;
}

// 1. test.wav: Bright 3-tone E5 (659.25Hz) -> G#5 (830.61Hz) -> B5 (987.77Hz)
const testNotes = [
    { freq: 659.25, start: 0.00, duration: 0.12, volume: 0.4 },
    { freq: 830.61, start: 0.13, duration: 0.12, volume: 0.4 },
    { freq: 987.77, start: 0.26, duration: 0.18, volume: 0.4 }
];
const testSamples = generateToneSequence(testNotes, 0.45);

// 2. approach.wav: 2-pulse alert (880Hz A5)
const approachNotes = [
    { freq: 880.00, start: 0.00, duration: 0.12, volume: 0.35 },
    { freq: 880.00, start: 0.16, duration: 0.14, volume: 0.35 }
];
const approachSamples = generateToneSequence(approachNotes, 0.35);

// 3. arrival.wav: Double-tone chime D5 (587.33Hz) -> A5 (880.00Hz)
const arrivalNotes = [
    { freq: 587.33, start: 0.00, duration: 0.15, volume: 0.4 },
    { freq: 880.00, start: 0.15, duration: 0.30, volume: 0.45 }
];
const arrivalSamples = generateToneSequence(arrivalNotes, 0.48);

// Target folder
const audioDir = path.join(__dirname, 'assets', 'audio');
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
}

fs.writeFileSync(path.join(audioDir, 'test.wav'), createWavBuffer(testSamples));
fs.writeFileSync(path.join(audioDir, 'approach.wav'), createWavBuffer(approachSamples));
fs.writeFileSync(path.join(audioDir, 'arrival.wav'), createWavBuffer(arrivalSamples));

console.log('✓ Luotu WAV-äänitiedostot kansioon assets/audio/: test.wav, approach.wav, arrival.wav');
