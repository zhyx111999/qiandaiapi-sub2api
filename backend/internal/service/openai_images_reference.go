package service

// InputImageCount is the number of input images (uploaded files and image URLs, the mask aside)
// sent with an Images request; each counts as a reference image for the group's reference
// surcharge (see ReferenceImageUnitPrice), which is 0 unless the group configures one.
func (r *OpenAIImagesRequest) InputImageCount() int {
	if r == nil {
		return 0
	}
	return len(r.Uploads) + len(r.InputImageURLs)
}
