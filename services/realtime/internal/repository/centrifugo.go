package repository

import (
	"bytes"
	"encoding/json"
	"net/http"
)

type CentrifugoClient struct{ BaseURL string }

func NewCentrifugoClient(baseURL string) *CentrifugoClient { return &CentrifugoClient{BaseURL: baseURL} }

func (c *CentrifugoClient) Publish(channel string, data any) error {
	payload, _ := json.Marshal(map[string]any{"method": "publish", "params": map[string]any{"channel": channel, "data": data}})
	req, _ := http.NewRequest(http.MethodPost, c.BaseURL+"/api", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "apikey centrifugo-api-key")
	resp, err := http.DefaultClient.Do(req)
	if err != nil { return err }
	defer resp.Body.Close()
	return nil
}
