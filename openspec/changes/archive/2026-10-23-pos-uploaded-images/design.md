# Design

Pass isUploadedImage(first.image) to the POS Image unoptimized prop. This bypasses the stale Next optimizer for uploads served dynamically by nginx. Preserve every other catalogue behavior.
