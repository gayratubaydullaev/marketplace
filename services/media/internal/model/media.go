package model

type File struct {
	ID          string `db:"id" json:"id"`
	URL         string `db:"url" json:"url"`
	ContentType string `json:"content_type"`
	Size        int64  `json:"size"`
}
