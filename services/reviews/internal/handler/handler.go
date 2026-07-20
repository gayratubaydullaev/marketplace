package handler
import ("github.com/gin-gonic/gin"; "github.com/gayrat/marketplace/packages/go-common/httpx"; "github.com/gayrat/marketplace/services/reviews/internal/service")
func ModerationPreview(c *gin.Context) { var body struct { Body string `json:"body"` }; _ = c.ShouldBindJSON(&body); httpx.OK(c, gin.H{"status": service.Status(body.Body)}) }
