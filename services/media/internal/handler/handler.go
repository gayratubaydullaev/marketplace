package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	commonauth "github.com/gayrat/marketplace/packages/go-common/auth"
	"github.com/gayrat/marketplace/packages/go-common/httpx"
	"github.com/gayrat/marketplace/packages/go-common/middleware"
	"github.com/gayrat/marketplace/services/media/internal/model"
	"github.com/gayrat/marketplace/services/media/internal/repository"
	"github.com/gayrat/marketplace/services/media/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Handler struct {
	tokens  *commonauth.Manager
	repo    *repository.MediaRepository
	storage *service.Storage
	bucket  string
}

func New(tokens *commonauth.Manager, repo *repository.MediaRepository, storage *service.Storage, bucket string) *Handler {
	return &Handler{tokens: tokens, repo: repo, storage: storage, bucket: bucket}
}

func (h *Handler) Register(r *gin.RouterGroup) {
	r.POST("/upload", middleware.JWT(h.tokens, false), h.upload)
	r.GET("/:id", middleware.JWT(h.tokens, false), h.get)
}

func (h *Handler) upload(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		httpx.BadRequest(c, "file required")
		return
	}
	if file.Size > 100*1024*1024 {
		httpx.BadRequest(c, "max 100MB")
		return
	}
	src, err := file.Open()
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}
	defer src.Close()

	data, err := io.ReadAll(src)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}

	tenantID := middleware.GetTenantID(c)
	ext := strings.ToLower(filepath.Ext(file.Filename))
	key := fmt.Sprintf("%s/%s%s", tenantID, uuid.NewString(), ext)
	contentType := file.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	url, err := h.storage.PutBytes(c.Request.Context(), tenantID, key, contentType, data)
	if err != nil {
		httpx.Internal(c, err.Error())
		return
	}

	variants := map[string]string{"original": url}
	if service.IsRasterImage(contentType, file.Filename) {
		webpBytes, encErr := service.EncodeWebP(bytes.NewReader(data), 1600)
		if encErr == nil {
			webpKey := service.WebPKey(key)
			webpURL, putErr := h.storage.PutBytes(c.Request.Context(), tenantID, webpKey, "image/webp", webpBytes)
			if putErr == nil {
				variants["webp"] = webpURL
			}
		}
	}
	if _, ok := variants["webp"]; !ok {
		variants["webp"] = strings.Replace(url, ext, ".webp", 1)
	}

	variantsJSON, _ := json.Marshal(variants)
	id := uuid.NewString()
	_ = h.repo.Create(
		model.File{ID: id, URL: url, ContentType: contentType, Size: file.Size},
		tenantID,
		middleware.GetClaims(c).UserID,
		h.bucket,
		key,
		string(variantsJSON),
	)
	httpx.Created(c, gin.H{
		"id":           id,
		"url":          url,
		"key":          key,
		"content_type": contentType,
		"size":         file.Size,
		"variants":     variants,
	})
}

func (h *Handler) get(c *gin.Context) {
	file, err := h.repo.Get(c.Param("id"))
	if err != nil {
		httpx.NotFound(c, "not found")
		return
	}
	c.JSON(http.StatusOK, file)
}
