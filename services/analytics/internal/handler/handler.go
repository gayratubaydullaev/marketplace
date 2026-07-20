package handler
import ("github.com/gin-gonic/gin"; "github.com/gayrat/marketplace/packages/go-common/httpx"; "github.com/gayrat/marketplace/packages/go-common/middleware"; "github.com/gayrat/marketplace/services/analytics/internal/service")
func Realtime(s *service.Realtime) gin.HandlerFunc { return func(c *gin.Context) { active, orders, ts := s.Metrics(middleware.GetTenantID(c)); httpx.OK(c, gin.H{"active_users": active, "orders_today": orders, "revenue_minute": 0, "currency": "UZS", "ts": ts}) } }
