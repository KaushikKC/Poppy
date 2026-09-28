# Third-party assets

## Phosphor Icons (MIT)

The tab bar glyphs in `frontend/index.html` are from [Phosphor
Icons](https://github.com/phosphor-icons/core), inlined as paths rather than loaded
as a package, because the app has to run with no network.

> MIT License
>
> Copyright (c) 2023 Phosphor Icons
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of
> this software and associated documentation files (the "Software"), to deal in the
> Software without restriction, including without limitation the rights to use,
> copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
> Software, and to permit persons to whom the Software is furnished to do so,
> subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
> FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
> COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN
> AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
> WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Why not SF Symbols

Apple's own answer to "how do I draw an interface icon" is: mostly, don't. Use SF
Symbols, or export the template of the nearest symbol and edit that, so weight,
scale and optical alignment match the system font by construction.

We cannot. The SF Symbols licence covers apps for Apple platforms, and `frontend/`
is one bundle that also ships inside the Android build. Phosphor is MIT, has matched
regular and fill weights on a single grid, and can ship on both.
