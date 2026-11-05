import type { Asset } from "../model/project";
import { vectorAsset } from "../model/assets";
import { importSVG } from "../import/svg";
import { prepareRaster } from "../tracing/raster";
/** Sequential preparation bounds memory and keeps an invalid batch atomic. */
export async function readAssets(
  files: File[],
  isCanceled: () => boolean = () => false,
): Promise<Asset[]> {
  if (!files.length || files.length > 24)
    throw Error("Choose 1–24 assets at a time.");
  const drafts: Asset[] = [];
  for (const file of files) {
    if (isCanceled())
      throw new DOMException("Asset upload canceled.", "AbortError");
    try {
      if (/\.svg$/i.test(file.name)) {
        if (file.size > 2e6) throw Error("Use an SVG smaller than 2 MB.");
        drafts.push(vectorAsset(importSVG(await file.text(), file.name)));
      } else if (/\.(png|jpe?g)$/i.test(file.name)) {
        const image = await prepareRaster(file);
        drafts.push({
          id: "asset-draft",
          name: file.name.slice(0, 120),
          kind: "image",
          dataURL: image.dataURL,
          width: image.width,
          height: image.height,
        });
      } else throw Error("Only SVG, PNG and JPG assets are supported.");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      throw Error(
        file.name +
          ": " +
          (e instanceof Error ? e.message : "Could not prepare this asset."),
        { cause: e },
      );
    }
  }
  if (isCanceled())
    throw new DOMException("Asset upload canceled.", "AbortError");
  return drafts;
}
