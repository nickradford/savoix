class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._chunks = [];
    this.port.onmessage = (e) => {
      if (e.data === "flush") {
        const totalLength = this._chunks.reduce((s, c) => s + c.length, 0);
        const merged = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of this._chunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        this.port.postMessage(merged.buffer, [merged.buffer]);
        this._chunks = [];
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      this._chunks.push(new Float32Array(input[0]));
    }
    return true;
  }
}

registerProcessor("pcm-recorder-processor", PCMRecorderProcessor);
