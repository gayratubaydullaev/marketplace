package sms

import "testing"

func TestLogSender(t *testing.T) {
	if err := (LogSender{}).Send("+998901234567", "test"); err != nil {
		t.Fatal(err)
	}
}

func TestFromEnvDefault(t *testing.T) {
	s := FromEnv()
	if s == nil {
		t.Fatal("expected sender")
	}
}
