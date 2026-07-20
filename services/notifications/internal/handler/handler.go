package handler
import ("github.com/gin-gonic/gin"; "github.com/gayrat/marketplace/packages/go-common/httpx")
func DefaultPreferences(c *gin.Context) { httpx.OK(c, gin.H{"email": true, "sms": true, "push": true, "in_app": true, "order_updates": true, "promotions": false, "digest": "instant"}) }
