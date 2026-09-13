# Third-party design references

## OpenReel Video (MIT)

- Source: https://github.com/Augani/openreel-video (cloned 2026-09-13 as a
  read-only reference outside this repository, never vendored).
- License: MIT, copyright Augustus Otu and Contributors. The MIT notice is
  reproduced here to satisfy its attribution condition:

> MIT License — Copyright (c) 2024-2026 Augustus Otu and Contributors.
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions: The above copyright
> notice and this permission notice shall be included in all copies or
> substantial portions of the Software.

- What was adapted into `apps/editor/renderer/index.html`: the SHAPE of the
  dark-editor token system (bg scale, panel/border/fg ramps, radius, density
  text sizes, timeline/track/stage token names) and NLE layout anatomy
  (topbar + media/stage/inspector + bottom timeline band with track-header
  rail, ruler, per-kind clip colors). No OpenReel source files were copied;
  all CSS/HTML was written fresh for this codebase. Upstream Palmier GPL
  clip colors (video teal-blue, audio green-teal, image/text purple) were
  used for the timeline palette, with text shifted to amber for contrast.
