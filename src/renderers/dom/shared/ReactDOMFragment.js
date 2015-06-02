/**
 * Copyright 2013-2015, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactDOMFragment
 * @typechecks static-only
 */

'use strict';

var ReactMultiChild = require('ReactMultiChild');
var ReactDOMComponent = require('ReactDOMComponent');

var assign = require('Object.assign');

/**
 * Creates a new React class that only contains components.
 *
 * @constructor ReactDOMFragment
 * @extends ReactMultiChild
 */
function ReactDOMFragment(element) {
  this._rootNodeID = null;
  this._renderedChildren = null;
}

ReactDOMFragment.Mixin = {
  mountComponent: function(rootID, transaction, context) {
    this._rootNodeID = rootID;

    var tagContent = this._createContentMarkup(transaction, context);
    return tagContent;
  },

  // TODO: new receiveComponent hook

  unmountComponent: function() {
    this.unmountChildren();
    this._rootNodeID = null;
  }
};

assign(
  ReactDOMFragment.prototype,

  // TODO: instead of overriding mount/unmount, split common functionality to
  // new mixin for clarity
  // TODO: Also don't include all of the actual DOM things we're not using
  // (events, etc)
  ReactDOMComponent.Mixin,
  ReactDOMFragment.Mixin,

  ReactMultiChild.Mixin
);

module.exports = ReactDOMFragment;
