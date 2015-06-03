/**
 * Copyright 2013-2015, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule ReactMultiChild
 * @typechecks static-only
 */

'use strict';

var ReactComponentEnvironment = require('ReactComponentEnvironment');
var ReactMultiChildUpdateTypes = require('ReactMultiChildUpdateTypes');
var ReactInstanceHandles = require('ReactInstanceHandles');

var ReactReconciler = require('ReactReconciler');
var ReactChildReconciler = require('ReactChildReconciler');

function getNodeCount(child) {
  if (child._renderedComponent &&
      child._renderedComponent._currentElement.type === 'frag') {
    return child._renderedComponent._nodeCount;
  } else {
    return 1;
  }
}

/**
 * Updating children of a component may trigger recursive updates. The depth is
 * used to batch recursive updates to render markup more efficiently.
 *
 * @type {number}
 * @private
 */
var updateDepth = 0;

/**
 * Queue of update configuration objects.
 *
 * Each object has a `type` property that is in `ReactMultiChildUpdateTypes`.
 *
 * @type {array<object>}
 * @private
 */
var updateQueue = [];

/**
 * Queue of markup to be rendered.
 *
 * @type {array<string>}
 * @private
 */
var markupQueue = [];

/**
 * Enqueues markup to be rendered and inserted at a supplied index.
 *
 * @param {string} parentID ID of the parent component.
 * @param {string} markup Markup that renders into an element.
 * @param {number} toIndex Destination index.
 * @private
 */
function enqueueMarkup(parentID, markup, toIndex) {
  // NOTE: Null values reduce hidden classes.
  updateQueue.push({
    parentID: parentID,
    parentNode: null,
    type: ReactMultiChildUpdateTypes.INSERT_MARKUP,
    markupIndex: markupQueue.push(markup) - 1,
    textContent: null,
    fromIndex: null,
    toIndex: toIndex,
  });
}

/**
 * Enqueues moving an existing element to another index.
 *
 * @param {string} parentID ID of the parent component.
 * @param {number} fromIndex Source index of the existing element.
 * @param {number} toIndex Destination index of the element.
 * @private
 */
function enqueueMove(parentID, fromIndex, toIndex) {
  // NOTE: Null values reduce hidden classes.
  updateQueue.push({
    parentID: parentID,
    parentNode: null,
    type: ReactMultiChildUpdateTypes.MOVE_EXISTING,
    markupIndex: null,
    textContent: null,
    fromIndex: fromIndex,
    toIndex: toIndex,
  });
}

/**
 * Enqueues removing an element at an index.
 *
 * @param {string} parentID ID of the parent component.
 * @param {number} fromIndex Index of the element to remove.
 * @private
 */
function enqueueRemove(parentID, fromIndex) {
  // NOTE: Null values reduce hidden classes.
  updateQueue.push({
    parentID: parentID,
    parentNode: null,
    type: ReactMultiChildUpdateTypes.REMOVE_NODE,
    markupIndex: null,
    textContent: null,
    fromIndex: fromIndex,
    toIndex: null,
  });
}

/**
 * Enqueues setting the text content.
 *
 * @param {string} parentID ID of the parent component.
 * @param {string} textContent Text content to set.
 * @private
 */
function enqueueTextContent(parentID, textContent) {
  // NOTE: Null values reduce hidden classes.
  updateQueue.push({
    parentID: parentID,
    parentNode: null,
    type: ReactMultiChildUpdateTypes.TEXT_CONTENT,
    markupIndex: null,
    textContent: textContent,
    fromIndex: null,
    toIndex: null,
  });
}

/**
 * Processes any enqueued updates.
 *
 * @private
 */
function processQueue() {
  if (updateQueue.length) {
    ReactComponentEnvironment.processChildrenUpdates(
      updateQueue,
      markupQueue
    );
    clearQueue();
  }
}

/**
 * Clears any enqueued updates.
 *
 * @private
 */
function clearQueue() {
  updateQueue.length = 0;
  markupQueue.length = 0;
}

/**
 * ReactMultiChild are capable of reconciling multiple children.
 *
 * @class ReactMultiChild
 * @internal
 */
var ReactMultiChild = {

  /**
   * Provides common functionality for components that must reconcile multiple
   * children. This is used by `ReactDOMComponent` to mount, update, and
   * unmount child components.
   *
   * @lends {ReactMultiChild.prototype}
   */
  Mixin: {

    /**
     * Generates a "mount image" for each of the supplied children. In the case
     * of `ReactDOMComponent`, a mount image is a string of markup.
     *
     * @param {?object} nestedChildren Nested child maps.
     * @return {array} An array of mounted representations.
     * @internal
     */
    mountChildren: function(nestedChildren, transaction, context) {
      var children = ReactChildReconciler.instantiateChildren(
        nestedChildren, transaction, context
      );
      this._renderedChildren = children;
      var mountImages = [];
      var nodesInserted = 0;
      for (var name in children) {
        if (children.hasOwnProperty(name)) {
          var child = children[name];
          // Inlined for performance, see `ReactInstanceHandles.createReactID`.
          var rootID = this._rootNodeID + name;

          var mountImage = ReactReconciler.mountComponent(
            child,
            rootID,
            transaction,
            context
          );

          if (Array.isArray(mountImage)) {
            mountImage = mountImage.join('');
          }

          child._nodeIndex = nodesInserted;

          mountImages.push(mountImage);

          // Copy the wrapped component's node count to the parent so that it can
          // be referenced after the component has been unmounted and can no
          // longer be accessed
          nodesInserted += child._nodeCount;
        }
      }
      return mountImages;
    },

    /**
     * Replaces any rendered children with a text content string.
     *
     * @param {string} nextContent String of content.
     * @internal
     */
    updateTextContent: function(nextContent) {
      updateDepth++;
      var errorThrown = true;
      try {
        var prevChildren = this._renderedChildren;
        // Remove any rendered children.
        ReactChildReconciler.unmountChildren(prevChildren);
        // TODO: The setTextContent operation should be enough
        for (var name in prevChildren) {
          if (prevChildren.hasOwnProperty(name)) {
            this._unmountChildByName(prevChildren[name], name);
          }
        }
        // Set new text content.
        this.setTextContent(nextContent);
        errorThrown = false;
      } finally {
        updateDepth--;
        if (!updateDepth) {
          if (errorThrown) {
            clearQueue();
          } else {
            processQueue();
          }
        }
      }
    },

    /**
     * Updates the rendered children with new children.
     *
     * @param {?object} nextNestedChildren Nested child maps.
     * @param {ReactReconcileTransaction} transaction
     * @internal
     */
    updateChildren: function(nextNestedChildren, transaction, context) {
      updateDepth++;
      var errorThrown = true;
      try {
        this._updateChildren(nextNestedChildren, transaction, context);
        errorThrown = false;
      } finally {
        updateDepth--;
        if (!updateDepth) {
          if (errorThrown) {
            clearQueue();
          } else {
            processQueue();
          }
        }

      }
    },

    /**
     * Improve performance by isolating this hot code path from the try/catch
     * block in `updateChildren`.
     *
     * @param {?object} nextNestedChildren Nested child maps.
     * @param {ReactReconcileTransaction} transaction
     * @final
     * @protected
     */
    _updateChildren: function(nextNestedChildren, transaction, context) {
      var prevChildren = this._renderedChildren;
      var nextChildren = ReactChildReconciler.updateChildren(
        prevChildren, nextNestedChildren, transaction, context
      );
      this._renderedChildren = nextChildren;
      if (!nextChildren && !prevChildren) {
        return;
      }
      var name;
      // `nextIndex` will increment for each child in `nextChildren`, but
      // `lastIndex` will be the last index visited in `prevChildren`.
      var lastNodeIndex = 0;
      var nextNodeIndex = 0;

      for (name in nextChildren) {
        if (!nextChildren.hasOwnProperty(name)) {
          continue;
        }

        var prevChild = prevChildren && prevChildren[name];
        var nextChild = nextChildren[name];

        if (prevChild === nextChild) {
          this.moveChild(prevChild, nextNodeIndex, lastNodeIndex);

          lastNodeIndex = Math.max(prevChild._nodeIndex, lastNodeIndex);
          prevChild._nodeIndex = nextNodeIndex;

        } else {
          if (prevChild) {
            // Update `lastIndex` before `_nodeIndex` gets unset by unmounting.
            lastNodeIndex = Math.max(prevChild._nodeIndex, lastNodeIndex);
            this._unmountChildByName(prevChild, name);

          }
          // The child must be instantiated before it's mounted.
          this._mountChildByNameAtIndex(
            nextChild, name, nextNodeIndex, transaction, context
          );
        }

        nextNodeIndex += nextChild._nodeCount;
      }

      // Remove children that are no longer present.
      for (name in prevChildren) {
        if (prevChildren.hasOwnProperty(name) &&
            !(nextChildren && nextChildren.hasOwnProperty(name))) {
          this._unmountChildByName(prevChildren[name], name);
        }
      }
    },

    /**
     * Unmounts all rendered children. This should be used to clean up children
     * when this component is unmounted.
     *
     * @internal
     */
    unmountChildren: function() {
      var renderedChildren = this._renderedChildren;
      ReactChildReconciler.unmountChildren(renderedChildren);
      this._renderedChildren = null;
    },

    /**
     * Moves a child component to the supplied index.
     *
     * @param {ReactComponent} child Component to move.
     * @param {number} toNodeIndex Destination index of the element.
     * @param {number} lastNodeIndex Last index visited of the siblings of `child`.
     * @protected
     */
    moveChild: function(child, toNodeIndex, lastNodeIndex) {
      // If the index of `child` is less than `lastIndex`, then it needs to
      // be moved. Otherwise, we do not need to move it because a child will be
      // inserted or moved before `child`.
      if (child._nodeIndex < lastNodeIndex) {
        for (var i = 0; i < getNodeCount(child); i++) {
          enqueueMove(this._rootNodeID, child._nodeIndex + i, toNodeIndex + i);
        }
      }
    },

    /**
     * Creates a child component.
     *
     * @param {ReactComponent} child Component to create.
     * @param {array<string>} mountImages Markup to insert.
     * @protected
     */
    createChild: function(child, mountImages) {
      var parentID = this._rootNodeID;
      var totalNodeIndex = child._nodeIndex;

      if (this._currentElement.type === 'frag') {
        // TODO: Properly traverse up the tree until a valid parent is found
        // TODO: How should the root being a fragment component be handled?
        parentID = ReactInstanceHandles.getParentID(this._rootNodeID);
        totalNodeIndex = this._currentElement._owner._nodeIndex + child._nodeIndex;
      }

      for (var i = 0; i < child._nodeCount; i++) {
        enqueueMarkup(parentID, mountImages[i], totalNodeIndex + i);
      }
    },

    /**
     * Removes a child component.
     *
     * @param {ReactComponent} child Child to remove.
     * @protected
     */
    removeChild: function(child) {
      var parentID = this._rootNodeID;
      var totalNodeIndex = child._nodeIndex;

      if (this._currentElement.type === 'frag') {
        // TODO: Properly traverse up the tree until a valid parent is found
        // TODO: How should the root being a fragment component be handled?
        parentID = ReactInstanceHandles.getParentID(this._rootNodeID);
        totalNodeIndex = this._currentElement._owner._nodeIndex + child._nodeIndex;
      }

      for (var i = 0; i < child._nodeCount; i++) {
        enqueueRemove(parentID, totalNodeIndex + i);
      }
    },

    /**
     * Sets this text content string.
     *
     * @param {string} textContent Text content to set.
     * @protected
     */
    setTextContent: function(textContent) {
      enqueueTextContent(this._rootNodeID, textContent);
    },

    /**
     * Mounts a child with the supplied name.
     *
     * NOTE: This is part of `updateChildren` and is here for readability.
     *
     * @param {ReactComponent} child Component to mount.
     * @param {string} name Name of the child.
     * @param {number} nodeIndex Index at which to insert the child.
     * @param {ReactReconcileTransaction} transaction
     * @private
     */
    _mountChildByNameAtIndex: function(
      child,
      name,
      nodeIndex,
      transaction,
      context) {
      // Inlined for performance, see `ReactInstanceHandles.createReactID`.
      var rootID = this._rootNodeID + name;
      var mountImages = ReactReconciler.mountComponent(
        child,
        rootID,
        transaction,
        context
      );
      child._nodeIndex = nodeIndex;

      if (!Array.isArray(mountImages)) {
        mountImages = [mountImages];
      }

      this.createChild(child, mountImages);
    },

    /**
     * Unmounts a rendered child by name.
     *
     * NOTE: This is part of `updateChildren` and is here for readability.
     *
     * @param {ReactComponent} child Component to unmount.
     * @param {string} name Name of the child in `this._renderedChildren`.
     * @private
     */
    _unmountChildByName: function(child, name) {
      this.removeChild(child);
      child._nodeIndex = null;
    },

  },

};

module.exports = ReactMultiChild;
