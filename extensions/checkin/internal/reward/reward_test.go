package reward

import (
	"errors"
	"testing"
)

func TestValidateRejectsNonPositiveOrInvertedRanges(t *testing.T) {
	for _, r := range []Range{{0, 100}, {-1, 100}, {500, 300}, {0, 0}} {
		if err := r.Validate(); !errors.Is(err, ErrInvalidRange) {
			t.Errorf("Validate(%+v) = %v, want ErrInvalidRange", r, err)
		}
	}
	if err := (Range{300, 500}).Validate(); err != nil {
		t.Fatalf("Validate(300..500) = %v", err)
	}
}

func TestDrawStaysInsideAndReachesBothBounds(t *testing.T) {
	r := Range{MinCents: 300, MaxCents: 302}
	seen := map[int64]bool{}
	for range 2000 {
		got, err := r.Draw()
		if err != nil {
			t.Fatal(err)
		}
		if got < r.MinCents || got > r.MaxCents {
			t.Fatalf("Draw() = %d outside %+v", got, r)
		}
		seen[got] = true
	}
	for cents := r.MinCents; cents <= r.MaxCents; cents++ {
		if !seen[cents] {
			t.Errorf("Draw() never produced %d", cents)
		}
	}
}

func TestDrawFixedAmount(t *testing.T) {
	got, err := Range{MinCents: 420, MaxCents: 420}.Draw()
	if err != nil || got != 420 {
		t.Fatalf("Draw() = %d, %v; want 420", got, err)
	}
}

func TestCentsConversion(t *testing.T) {
	if got := ToCents(4.2); got != 420 {
		t.Fatalf("ToCents(4.2) = %d", got)
	}
	if got := ToCents(3); got != 300 {
		t.Fatalf("ToCents(3) = %d", got)
	}
	if got := FromCents(342); got != 3.42 {
		t.Fatalf("FromCents(342) = %v", got)
	}
}
