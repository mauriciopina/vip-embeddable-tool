var View = require('./view.js');
var api = require('../api.js');
var $ = require('jquery');
var colors = require('../colors.js');
window.$ = $;
module.exports = View.extend({

  $id          : 'address-view',

  template     : require('./templates/address-lookup.hbs'),

  multipleElections : require('./templates/partials/multiple-elections.hbs'),

  events : {
    '#plus-icon click' : 'openAboutModal',
    '#close-button click' : 'closeAboutModal',
    '#submit-address-button click' : 'submitAddress'
  },

  hasSubmitted: false,

  address : '',

  resizer: function () {
    // reset about modal max height
    $('#_vit').find('#about.modal').css({
      'max-height': $('#_vit').height() - 120 + 'px'
    });

    // constrain container to parent width
    if (this.$container.parent().width() < this.$container.width()) {
      this.$container.width(this.$container.parent().width());
    }
  },

  onAfterRender : function(options) {
    var $address = this.find('#address-input');
    var $aboutModal = this.find('#about');
    var $notFoundModal = this.find('#address-not-found');
    var $currentLocationModal = this.find('#current-location');

    // set container dimensions
    this.$container.css({
      'max-width': 'none',
      'width' : options.width,
      'height' : options.height
    });

    // can we just do this in CSS?
    $("#_vit .footer").css("max-width", "none")

    // limit user-uploaded image width
    if (this.$container.width() > 600) {
      $('#user-image').css('max-width', '85%');
    }

    // apply custom colors
    if (options.colors) {
      colors.replace(options.colors);
    }

    // handle container clicks and hide modals
    this.$container.on('click', function (e) {
      if (e.target !== $aboutModal) $aboutModal.hide();
      if (e.target !== $notFoundModal) $notFoundModal.hide();
      if (e.target !== $currentLocationModal) $currentLocationModal.hide();
      if (e.target !== this.find('#fade')) this.find('#fade').fadeOut('fast');
    }.bind(this));

    this.autocomplete = new google.maps.places.Autocomplete($address[0], {
      types: ['address'],
      componentRestrictions: { country: 'us' }
    });

    // debounce submissions
    this.hasSubmitted = false;

    // disable fast-click for place autocomplete by listening for DOM Node
    // Insertion. PAC doesn't work with fastlick. See:
    // https://github.com/ftlabs/fastclick/issues/316
    $(document).on({
      DOMNodeInserted: function() {
        $('.pac-item, .pac-item span', this).addClass('needsclick');
      }
    }, '.pac-container');

    // bind resize event
    // note: debounce
    this.resizer();
    $(window).on('resize', this.resizer.bind(this));

    // bind autocomplete listener
    google.maps.event.addListener(this.autocomplete, 'place_changed', this.autocompleteListener.bind(this));
  },

  autocompleteListener: function () {
    // TODO: replace this with a debouncer
    if (this.hasSubmitted) return;

    if (this.autocomplete.getPlace()) {
      this.address = this.autocomplete.getPlace().formatted_address || this.autocomplete.getPlace().name;
    } else {
      this.address = this.find('#address-input').val();
    }

    this.hasSubmitted = true;

    this._makeRequest({
      address: this.address
    });

    this.toggleLoadingDisplay();
  },

  currentLocationAutocompleteListener: function (response) {
    var address = this.autocomplete.getPlace().formatted_address || this.autocomplete.getPlace().name;

    var stateName = (response.state && response.state.length) ? response.state[0].name : '';
    var stateAbbr = (stateName === 'Washington' ? 'WA' : 'OR');

    if (address.indexOf(stateAbbr) !== -1) {

      if (!this.autocomplete.getPlace().geometry) {

        this._geocode(this.autocomplete.getPlace().name, function(geocodedLocation) {
          $.extend(response, { currentLocation: geocodedLocation });

          this.triggerRouteEvent('addressViewSubmit', response);
        }.bind(this))

      } else {
        var location = this.autocomplete.getPlace().geometry.location;

        $.extend(response, { currentLocation: location });

        this.triggerRouteEvent('addressViewSubmit', response);
      }

      this.toggleLoadingDisplay();
    } else {

      this.find('.loading').hide();
      this.find('#current-location').hide()
      this.find('#out-of-state')
        .fadeIn('fast')
        .one('click', function() {
          this.triggerRouteEvent('addressViewSubmit', response)
        }.bind(this));

    }
  },

  submitAddress: function () {
    google.maps.event.trigger(this.autocomplete, 'place_changed'); 
  }, 

  onRemove: function() {
    google.maps.event.clearInstanceListeners(this.autocomplete);
  },

  handleElectionData: function(response) {
    var that = this;

    window.console && console.log(response)

    var stateName = ((response.state && response.state.length) ? response.state[0].name : '');
    if (stateName === 'Washington' || stateName === 'Oregon') {
      this.find('#current-location').fadeIn('fast');
      this.find('#fade').fadeTo('fast', .2);
      this.find('.loading').hide();

      $('#use-current-location').one('click', function() {
        that.find('#current-location').fadeOut('fast');
        that.find('.loading').show();
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(function(position) {
            var lat = position.coords.latitude
              , lng = position.coords.longitude;
            that._reverseGeocode(
              position.coords.latitude,
              position.coords.longitude,
              function(address) {
                var stateAbbr = (stateName === 'Washington' ? 'WA' : 'OR');
                if (address.indexOf(stateAbbr) !== -1) {
                  var currentLocation = new google.maps.LatLng(
                    position.coords.latitude,
                    position.coords.longitude
                  );
                  $.extend(response, { currentLocation: currentLocation });
                  that.triggerRouteEvent('addressViewSubmit', response);
                } else {
                  that.find('.loading').hide();
                  that.find('#out-of-state')
                    .fadeIn('fast')
                    .one('click', function() {
                      that.triggerRouteEvent('addressViewSubmit', response)
                    });
                }
            });
          }, function(err) {
            window.console && console.warn('error...' + err.code + err.message)
          });
        } else
          that.triggerRouteEvent('addressViewRerender')
      });

      $('#use-registered-address').one('click', function() {
        that.triggerRouteEvent('addressViewSubmit', response);
      });

      that.find('#use-different-address').one('click', function() {

        var newInput = $('<input>')
          .attr('type', 'text')
          .attr('placeholder', "Enter a different address")
          .css('margin', '10px 0 0')
          .insertBefore('#current-location span');

        that.autocomplete = new google.maps.places.Autocomplete(newInput[0], {
          types: ['address'],
          componentRestrictions: { country: 'us' }
        });

        google.maps.event.addListener(that.autocomplete, 'place_changed', that.currentLocationAutocompleteListener.bind(that, response));

      });
      return;
    }

    if (response.otherElections) {

      this.$el.append(this.multipleElections({
        elections: [response.election].concat(response.otherElections)
      }));

      this.find('#multiple-elections').fadeIn('fast');
      this.find('#fade').fadeTo('fast', .2);
      $('.checked:first').removeClass('hidden');
      $('.unchecked:first').addClass('hidden');
      $(this.find('#multiple-elections button')).on('click', function() {

        var id = this.find('.checked:not(.hidden)').siblings('.hidden').eq(1).text();

        this._makeRequest({
          address: this._parseAddress(response.normalizedInput),
          success: function(newResponse) {
            this.triggerRouteEvent('addressViewSubmit', newResponse);
          }.bind(this),
          electionId: id
        });

      }.bind(this));
      $('.election').on('click', function() {
        $('.checked').addClass('hidden');
        $('.unchecked').removeClass('hidden')
        $(this).find('.checked').removeClass('hidden');
        $(this).find('.unchecked').addClass('hidden');
      });
      
    } else this.triggerRouteEvent('addressViewSubmit', response);
  },

  handleAddressNotFound: function() {
    this.$el.unbind('click');
    google.maps.event.addListener(this.autocomplete, 'place_changed', this.autocompleteListener.bind(this));
    this.find('.loading').hide();
    setTimeout(function() {
      this.find('.loading').hide();
    }.bind(this), 500);
    this.find('#address-not-found').fadeIn();
    this.find('#fade').fadeTo('fast', .2);
    this.find('#address-not-found h1').text(this.address);
    this.find('#address-input').value = "";
    this.hasSubmitted = false;
  },

  selectElection: function(e) {
    var electionId = e.currentTarget.querySelector('.hidden');
    this.triggerRouteEvent('');
  },

  openAboutModal: function(e) {
    this.find('#fade').fadeTo('fast', .2);
    this.find('#about').fadeIn('fast')
   
    if ( ($("#_vit").find("#about.modal").find("p").height() + $("#_vit").find("#about.modal").find("h2").height()) > ($("#_vit").height() - 120) ) {
      $("#_vit").find("#about.modal").find("#close-button").hide();
       $("#_vit").find("#about.modal").find(".close-modal-text-button").toggle();
    }

    e.stopPropagation();
  },

  closeAboutModal: function() {
    this.find('#about').fadeOut('fast');
    this.find('#fade').fadeOut('fast');
  },

  _reverseGeocode: function(lat, lng, callback) {
    var latLng = new google.maps.LatLng(lat, lng);
    var geocoder = new google.maps.Geocoder();
    geocoder.geocode({
      'latLng': latLng
    }, function(results, status) {
      if (status === google.maps.GeocoderStatus.OK && results.length)
        callback(results[0].formatted_address);
    })
  }
});