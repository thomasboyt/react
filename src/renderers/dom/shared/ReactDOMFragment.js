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
var validateDOMNesting = require('validateDOMNesting');

// TODO: Dedupe this between here and ReactDOMComponent
function processChildContext(context, inst) {
  if (__DEV__) {
    // Pass down our tag name to child components for validation purposes
    context = assign({}, context);
    var info = context[validateDOMNesting.ancestorInfoContextKey];
    context[validateDOMNesting.ancestorInfoContextKey] =
      validateDOMNesting.updatedAncestorInfo(info, inst._tag, inst);
  }
  return context;
}

/**
 * Creates a new React class that only contains components.
 *
 * @constructor ReactDOMFragment
 * @extends ReactMultiChild
 */
function ReactDOMFragment(element) {
  this._rootNodeID = null;
  this._renderedChildren = null;
  this._numNodes = null;
}

ReactDOMFragment.Mixin = {
  mountComponent: function(rootID, transaction, context) {
    this._rootNodeID = rootID;

    var props = this._currentElement.props;
    this._numNodes = props.children.length;

    var tagContent = this._createContentMarkup(transaction, context);
    return tagContent;
  },

  _createContentMarkup(transaction, context) {
    var props = this._currentElement.props;

    var mountImages = this.mountChildren(
      props.children,
      transaction,
      processChildContext(context, this)
    );

    return mountImages;
  },

  // TODO: new receiveComponent hook

  unmountComponent: function() {
    this.unmountChildren();
    this._rootNodeID = null;
    this._numNodes = null;
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
