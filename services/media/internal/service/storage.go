package service

import (
	"bytes"
	"context"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	commoncfg "github.com/gayrat/marketplace/packages/go-common/config"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Storage struct {
	client *minio.Client
	cfg    commoncfg.Config
}

func NewStorage(cfg commoncfg.Config) *Storage {
	s := &Storage{cfg: cfg}
	secure := strings.EqualFold(os.Getenv("MINIO_SECURE"), "true")
	client, err := minio.New(cfg.MinioEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinioAccessKey, cfg.MinioSecretKey, ""),
		Secure: secure,
	})
	if err != nil {
		log.Printf("minio init: %v", err)
		return s
	}
	s.client = client
	exists, _ := client.BucketExists(context.Background(), cfg.MinioBucket)
	if !exists {
		_ = client.MakeBucket(context.Background(), cfg.MinioBucket, minio.MakeBucketOptions{})
	}
	return s
}

func (s *Storage) URL(key string) string {
	scheme := "http"
	if strings.EqualFold(os.Getenv("MINIO_SECURE"), "true") {
		scheme = "https"
	}
	return scheme + "://" + s.cfg.MinioEndpoint + "/" + s.cfg.MinioBucket + "/" + key
}

func (s *Storage) Put(ctx context.Context, tenantID, key, contentType string, size int64, source io.Reader) (string, error) {
	url := s.URL(key)
	if s.client != nil {
		_, err := s.client.PutObject(ctx, s.cfg.MinioBucket, key, source, size, minio.PutObjectOptions{ContentType: contentType})
		return url, err
	}
	_ = os.MkdirAll(filepath.Join("tmp/media", tenantID), 0o755)
	out, err := os.Create(filepath.Join("tmp/media", key))
	if err != nil {
		return "", err
	}
	defer out.Close()
	_, err = io.Copy(out, source)
	return "/media/" + strings.TrimPrefix(key, "/"), err
}

func (s *Storage) PutBytes(ctx context.Context, tenantID, key, contentType string, data []byte) (string, error) {
	return s.Put(ctx, tenantID, key, contentType, int64(len(data)), bytes.NewReader(data))
}
