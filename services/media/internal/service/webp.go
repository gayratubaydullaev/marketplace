package service

import (
	"bytes"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"path/filepath"
	"strings"

	"github.com/chai2010/webp"
	"github.com/disintegration/imaging"
)

// EncodeWebP resizes (max 1600px) and encodes an image as WebP quality 80.
func EncodeWebP(src io.Reader, maxEdge int) ([]byte, error) {
	img, _, err := image.Decode(src)
	if err != nil {
		return nil, fmt.Errorf("decode image: %w", err)
	}
	if maxEdge <= 0 {
		maxEdge = 1600
	}
	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	if w > maxEdge || h > maxEdge {
		img = imaging.Fit(img, maxEdge, maxEdge, imaging.Lanczos)
	}
	var buf bytes.Buffer
	if err := webp.Encode(&buf, img, &webp.Options{Quality: 80}); err != nil {
		return nil, fmt.Errorf("encode webp: %w", err)
	}
	return buf.Bytes(), nil
}

func WebPKey(originalKey string) string {
	ext := filepath.Ext(originalKey)
	base := strings.TrimSuffix(originalKey, ext)
	return base + ".webp"
}

func IsRasterImage(contentType, filename string) bool {
	ct := strings.ToLower(contentType)
	if strings.HasPrefix(ct, "image/") && !strings.Contains(ct, "svg") {
		return true
	}
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff":
		return true
	default:
		return false
	}
}
