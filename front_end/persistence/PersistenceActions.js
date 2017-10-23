// Copyright (c) 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

Persistence.PersistenceActions = {};

/**
 * @implements {UI.ContextMenu.Provider}
 * @unrestricted
 */
Persistence.PersistenceActions.ContextMenuProvider = class {
  /**
   * @override
   * @param {!Event} event
   * @param {!UI.ContextMenu} contextMenu
   * @param {!Object} target
   */
  appendApplicableItems(event, contextMenu, target) {
    var contentProvider = /** @type {!Common.ContentProvider} */ (target);
    var uiSourceCode = contentProvider instanceof Workspace.UISourceCode ?
        /** @type {!Workspace.UISourceCode} */ (contentProvider) :
        null;

    async function saveAs() {
      if (uiSourceCode)
        uiSourceCode.commitWorkingCopy();
      var content = await contentProvider.requestContent();
      var url = contentProvider.contentURL();
      Workspace.fileManager.save(url, /** @type {string} */ (content), true);
      Workspace.fileManager.close(url);
    }

    contextMenu.appendSeparator();
    if (contentProvider.contentType().isDocumentOrScriptOrStyleSheet())
      contextMenu.appendItem(Common.UIString('Save as...'), saveAs);
    if (uiSourceCode && Persistence.networkPersistenceManager.canSaveUISourceCodeForOverrides(uiSourceCode)) {
      contextMenu.appendItem(Common.UIString('Save for overrides'), () => {
        uiSourceCode.commitWorkingCopy();
        Persistence.networkPersistenceManager.saveUISourceCodeForOverrides(
            /** @type {!Workspace.UISourceCode} */ (uiSourceCode));
      });
    }
  }
};