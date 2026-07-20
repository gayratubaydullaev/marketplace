package service
import ("time"; "github.com/gayrat/marketplace/services/analytics/internal/repository")
type Realtime struct { orders *repository.OrdersRepository }
func NewRealtime(orders *repository.OrdersRepository) *Realtime { return &Realtime{orders} }
func (s *Realtime) Metrics(tenantID string) (int, int, time.Time) { n := s.orders.CountToday(tenantID); return n*3+12, n, time.Now() }
