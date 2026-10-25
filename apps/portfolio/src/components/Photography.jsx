import React, { useState } from 'react';
import { Camera, MapPin, Calendar, X, ChevronLeft, ChevronRight } from 'lucide-react';

const Photography = ({ photography }) => {
  const [currentLocationIndex, setCurrentLocationIndex] = useState(0);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const locationsPerPage = 4;
  const totalPages = Math.ceil(photography.length / locationsPerPage);
  const currentPage = Math.floor(currentLocationIndex / locationsPerPage);

  const visibleLocations = photography.slice(
    currentPage * locationsPerPage,
    (currentPage + 1) * locationsPerPage
  );

  const formatDate = (dateString) => {
    const [year, month] = dateString.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const handlePrevLocations = () => {
    if (currentPage > 0) {
      setCurrentLocationIndex((currentPage - 1) * locationsPerPage);
    }
  };

  const handleNextLocations = () => {
    if (currentPage < totalPages - 1) {
      setCurrentLocationIndex((currentPage + 1) * locationsPerPage);
    }
  };

  const openLightbox = (location) => {
    setSelectedLocation(location);
    setCurrentPhotoIndex(0);
  };

  const closeLightbox = () => {
    setSelectedLocation(null);
    setCurrentPhotoIndex(0);
  };

  const handlePrevPhoto = (e) => {
    e.stopPropagation();
    if (selectedLocation && currentPhotoIndex > 0) {
      setCurrentPhotoIndex(currentPhotoIndex - 1);
    }
  };

  const handleNextPhoto = (e) => {
    e.stopPropagation();
    if (selectedLocation && currentPhotoIndex < selectedLocation.photos.length - 1) {
      setCurrentPhotoIndex(currentPhotoIndex + 1);
    }
  };

  const handleKeyDown = (e) => {
    if (!selectedLocation) return;

    if (e.key === 'ArrowLeft') {
      handlePrevPhoto(e);
    } else if (e.key === 'ArrowRight') {
      handleNextPhoto(e);
    } else if (e.key === 'Escape') {
      closeLightbox();
    }
  };

  React.useEffect(() => {
    if (selectedLocation) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedLocation, currentPhotoIndex]);

  return (
    <section id="photography" className="section-padding">
      <div className="container-width">
        <h2 className="text-4xl md:text-5xl font-bold text-dark-text-primary mb-4">
          Photography & Exploration
        </h2>
        <div className="w-20 h-1 bg-dark-border mb-12"></div>

        {/* Locations Carousel */}
        <div className="relative">
          {/* Navigation Arrows for Locations */}
          {photography.length > locationsPerPage && (
            <>
              <button
                onClick={handlePrevLocations}
                disabled={currentPage === 0}
                className={`absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-12 h-12 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center transition-all ${
                  currentPage === 0
                    ? 'opacity-30 cursor-not-allowed'
                    : 'hover:bg-dark-border hover:border-dark-text-muted'
                }`}
              >
                <ChevronLeft className="text-dark-text-primary" size={24} />
              </button>

              <button
                onClick={handleNextLocations}
                disabled={currentPage === totalPages - 1}
                className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-12 h-12 rounded-full bg-dark-surface border border-dark-border flex items-center justify-center transition-all ${
                  currentPage === totalPages - 1
                    ? 'opacity-30 cursor-not-allowed'
                    : 'hover:bg-dark-border hover:border-dark-text-muted'
                }`}
              >
                <ChevronRight className="text-dark-text-primary" size={24} />
              </button>
            </>
          )}

          {/* Locations Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {visibleLocations.map((location, index) => (
              <div
                key={currentPage * locationsPerPage + index}
                onClick={() => openLightbox(location)}
                className="group relative aspect-square overflow-hidden rounded-lg cursor-pointer bg-dark-surface border border-dark-border hover:border-dark-text-muted transition-all"
              >
                <img
                  src={location.coverImage}
                  alt={location.location}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-white font-semibold mb-1">{location.location}</h3>
                    <div className="flex items-center justify-between text-gray-300 text-xs">
                      <div className="flex items-center">
                        <MapPin size={12} className="mr-1" />
                        <span>{location.photos.length} photos</span>
                      </div>
                      <div className="flex items-center">
                        <Calendar size={12} className="mr-1" />
                        <span>{formatDate(location.date)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Page Indicators */}
          {photography.length > locationsPerPage && (
            <div className="flex justify-center gap-2 mt-8">
              {Array.from({ length: totalPages }).map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentLocationIndex(index * locationsPerPage)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === currentPage
                      ? 'bg-dark-text-primary w-8'
                      : 'bg-dark-border hover:bg-dark-text-muted'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Lightbox Modal */}
        {selectedLocation && (
          <div
            className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
            onClick={closeLightbox}
          >
            <button
              onClick={closeLightbox}
              className="absolute top-6 right-6 text-white hover:text-gray-300 transition-colors z-50"
            >
              <X size={32} />
            </button>

            {/* Photo Navigation Arrows */}
            {selectedLocation.photos.length > 1 && (
              <>
                <button
                  onClick={handlePrevPhoto}
                  disabled={currentPhotoIndex === 0}
                  className={`absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-black/50 border border-white/20 flex items-center justify-center transition-all z-50 ${
                    currentPhotoIndex === 0
                      ? 'opacity-30 cursor-not-allowed'
                      : 'hover:bg-black/70 hover:border-white/40'
                  }`}
                >
                  <ChevronLeft className="text-white" size={28} />
                </button>

                <button
                  onClick={handleNextPhoto}
                  disabled={currentPhotoIndex === selectedLocation.photos.length - 1}
                  className={`absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-black/50 border border-white/20 flex items-center justify-center transition-all z-50 ${
                    currentPhotoIndex === selectedLocation.photos.length - 1
                      ? 'opacity-30 cursor-not-allowed'
                      : 'hover:bg-black/70 hover:border-white/40'
                  }`}
                >
                  <ChevronRight className="text-white" size={28} />
                </button>
              </>
            )}

            <div className="max-w-6xl w-full" onClick={(e) => e.stopPropagation()}>
              <img
                src={selectedLocation.photos[currentPhotoIndex].image}
                alt={selectedLocation.photos[currentPhotoIndex].title}
                className="w-full h-auto rounded-lg max-h-[70vh] object-contain"
              />
              <div className="mt-6 text-center">
                <h3 className="text-2xl font-bold text-white mb-2">
                  {selectedLocation.photos[currentPhotoIndex].title}
                </h3>
                <div className="flex items-center justify-center gap-6 text-gray-300 mb-3">
                  <div className="flex items-center">
                    <MapPin size={16} className="mr-2" />
                    {selectedLocation.location}
                  </div>
                  <div className="flex items-center">
                    <Calendar size={16} className="mr-2" />
                    {formatDate(selectedLocation.date)}
                  </div>
                </div>
                <p className="text-gray-400 mb-4">
                  {selectedLocation.photos[currentPhotoIndex].description}
                </p>

                {/* Photo Counter */}
                {selectedLocation.photos.length > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    {selectedLocation.photos.map((_, index) => (
                      <button
                        key={index}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentPhotoIndex(index);
                        }}
                        className={`w-2 h-2 rounded-full transition-all ${
                          index === currentPhotoIndex
                            ? 'bg-white w-8'
                            : 'bg-gray-500 hover:bg-gray-400'
                        }`}
                      />
                    ))}
                  </div>
                )}

                <p className="text-gray-500 text-sm mt-2">
                  {currentPhotoIndex + 1} / {selectedLocation.photos.length}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default Photography;
