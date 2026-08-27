/** Types for the CSS build script, so the isolation guard test can import it. */

/** The class the editor mounts inside. Nothing in builder.css may match outside it. */
export declare const BUILDER_SCOPE: '.bnb-root'

/** The class rendered banners sit inside, in the editor and on the host page alike. */
export declare const RENDERER_SCOPE: '.bnbr'

/** Compiles one stylesheet entry and returns the scoped CSS. */
export declare function compileCss(name: 'builder' | 'renderer'): Promise<string>
