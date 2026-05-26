declare module 'essentia.js' {
  export const EssentiaWASM: unknown
  export default class Essentia {
    constructor(wasm: unknown)
    [key: string]: unknown
  }
  export { Essentia }
}

declare module 'essentia.js/dist/essentia.js-core.es.js' {
  export default class Essentia {
    constructor(wasm: unknown)
    [key: string]: unknown
  }
}

declare module 'essentia.js/dist/essentia-wasm.web.js' {
  export function EssentiaWASM(): Promise<unknown>
}
