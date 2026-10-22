/** A cropped song cover (JPEG, or PNG when it has transparency) as a named File. */
export function toCoverFile(blob: Blob): File {
  const png = blob.type === "image/png"
  return new File([blob], png ? "cover.png" : "cover.jpg", {
    type: png ? "image/png" : "image/jpeg",
  })
}
