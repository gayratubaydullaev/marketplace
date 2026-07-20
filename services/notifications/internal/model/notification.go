package model

import "encoding/json"
type Notification struct { ID string `db:"id" json:"id"`; UserID string `db:"user_id" json:"user_id"`; Channel string `db:"channel" json:"channel"`; Type string `db:"type" json:"type"`; Title json.RawMessage `db:"title" json:"title"`; Body json.RawMessage `db:"body" json:"body"` }
