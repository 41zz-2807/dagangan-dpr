#!/usr/bin/env python3
"""Buat ikon PNG (pure python, tanpa Pillow) untuk PWA Dagang."""
import struct
import sys
import zlib


def make_png(size: int, path: str) -> None:
    bg = (5, 150, 105, 255)      # brand-600
    fg = (255, 255, 255, 255)
    transparent = (0, 0, 0, 0)
    radius = int(size * 0.22)

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            # rounded rectangle background
            cx = min(max(x, radius), size - 1 - radius)
            cy = min(max(y, radius), size - 1 - radius)
            dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            inside = (radius <= size - 1 - radius) and dist <= radius
            if not inside:
                row += bytes(transparent)
                continue

            # shopping bag body (roof shape)
            nx = (x - size / 2) / (size * 0.22)
            top = size * 0.30 + abs(nx) * size * 0.05
            body = (size * 0.26 <= x <= size * 0.74) and (top <= y <= size * 0.76)

            # handle (ring bagian atas)
            hcx, hcy, hr = size / 2, size * 0.34, size * 0.115
            d = ((x - hcx) ** 2 + (y - hcy) ** 2) ** 0.5
            ring = abs(d - hr) <= size * 0.032 and y <= hcy + hr * 0.55 and y >= hcy - hr - size * 0.045

            if body or ring:
                row += bytes(fg)
            else:
                row += bytes(bg)
        rows.append(bytes(row))

    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")

    with open(path, "wb") as handle:
        handle.write(png)
    print(f"{path} ({size}x{size}, {len(png)} byte)")


if __name__ == "__main__":
    out_dir = sys.argv[1]
    make_png(192, f"{out_dir}/icon-192.png")
    make_png(512, f"{out_dir}/icon-512.png")
