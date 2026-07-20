package model

// PublishRequest is the payload accepted by the administrative publish endpoint.
type PublishRequest struct {
	Channel string `json:"channel" binding:"required"`
	Data    any    `json:"data" binding:"required"`
}
