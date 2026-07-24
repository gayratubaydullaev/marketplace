package httpx

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type ErrorBody struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Details any    `json:"details,omitempty"`
}

func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, data)
}

func Created(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, data)
}

func Fail(c *gin.Context, status int, code, msg string) {
	c.AbortWithStatusJSON(status, ErrorBody{Error: msg, Code: code})
}

func BadRequest(c *gin.Context, msg string) {
	Fail(c, http.StatusBadRequest, "bad_request", msg)
}

func Unauthorized(c *gin.Context, msg string) {
	Fail(c, http.StatusUnauthorized, "unauthorized", msg)
}

func Forbidden(c *gin.Context, msg string) {
	Fail(c, http.StatusForbidden, "forbidden", msg)
}

func NotFound(c *gin.Context, msg string) {
	Fail(c, http.StatusNotFound, "not_found", msg)
}

func Conflict(c *gin.Context, msg string) {
	Fail(c, http.StatusConflict, "conflict", msg)
}

func TooManyRequests(c *gin.Context, msg string) {
	Fail(c, http.StatusTooManyRequests, "rate_limited", msg)
}

func Internal(c *gin.Context, msg string) {
	Fail(c, http.StatusInternalServerError, "internal_error", msg)
}
