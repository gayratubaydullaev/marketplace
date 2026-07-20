package kafka

// Topic names from TZ §3.5 and the implemented event flow. Use these
// constants across producers and consumers so a topic rename is compile-visible.
const (
	TopicUserRegistered       = "user.registered"
	TopicProductCreated       = "product.created"
	TopicProductUpdated       = "product.updated"
	TopicProductDeleted       = "product.deleted"
	TopicInventoryChanged     = "inventory.changed"
	TopicCartUpdated          = "cart.updated"
	TopicOrderCreated         = "order.created"
	TopicOrderPaid            = "order.paid"
	TopicOrderShipped         = "order.shipped"
	TopicOrderStatusUpdated   = "order.status_updated"
	TopicOrderCancelled       = "order.cancelled"
	TopicPaymentSucceeded     = "payment.succeeded"
	TopicPaymentFailed        = "payment.failed"
	TopicVendorRegistered     = "vendor.registered"
	TopicVendorApproved       = "vendor.approved"
	TopicVendorSuspended      = "vendor.suspended"
	TopicReviewSubmitted      = "review.submitted"
	TopicReviewCreated        = "review.created"
	TopicNotificationSend     = "notification.send"
	TopicSearchIndex          = "search.index"
	TopicAnalyticsEvent       = "analytics.event"
	TopicRecommendationUpdate = "recommendation.update"
)

func AllTopics() []string {
	return []string{
		TopicUserRegistered, TopicProductCreated, TopicProductUpdated, TopicProductDeleted,
		TopicInventoryChanged, TopicCartUpdated, TopicOrderCreated, TopicOrderPaid,
		TopicOrderShipped, TopicOrderStatusUpdated, TopicOrderCancelled, TopicPaymentSucceeded,
		TopicPaymentFailed, TopicVendorRegistered, TopicVendorApproved, TopicVendorSuspended,
		TopicReviewSubmitted, TopicReviewCreated, TopicNotificationSend, TopicSearchIndex,
		TopicAnalyticsEvent, TopicRecommendationUpdate,
	}
}
