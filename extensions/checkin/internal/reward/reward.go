// Package reward draws daily check-in rewards. Amounts are whole cents, so the
// configured bounds are hit exactly and never drift through float rounding.
package reward

import (
	"errors"
	"math"
	"math/rand/v2"
)

// ErrInvalidRange reports bounds that cannot always produce a positive reward.
var ErrInvalidRange = errors.New("reward range must satisfy 0 < min <= max")

// Range is an inclusive reward range in cents.
type Range struct {
	MinCents int64
	MaxCents int64
}

// Validate checks that every draw from r is a positive amount.
func (r Range) Validate() error {
	if r.MinCents <= 0 || r.MaxCents < r.MinCents {
		return ErrInvalidRange
	}
	return nil
}

// Draw returns a uniformly distributed amount in [MinCents, MaxCents].
func (r Range) Draw() (int64, error) {
	if err := r.Validate(); err != nil {
		return 0, err
	}
	return r.MinCents + rand.Int64N(r.MaxCents-r.MinCents+1), nil
}

// ToCents converts a currency amount such as 3.5 to whole cents.
func ToCents(amount float64) int64 {
	return int64(math.Round(amount * 100))
}

// FromCents converts whole cents back to a currency amount.
func FromCents(cents int64) float64 {
	return float64(cents) / 100
}
