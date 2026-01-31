import { Resvg } from "@resvg/resvg-js";

export function svgToPng(svg: string, scale = 2): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "zoom",
      value: scale,
    },
    font: {
      loadSystemFonts: true,
    },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}
