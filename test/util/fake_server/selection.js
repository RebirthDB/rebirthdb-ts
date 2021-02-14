var helper = require(__dirname + '/helper.js');
var Sequence = require(__dirname + '/sequence.js');

function Selection(selection, table) {
  this.selection = selection || [];
  this.length = this.selection.length;
  this.table = table;
}

// Import methods from Sequence
var keys = Object.keys(Sequence.prototype);
for (var i = 0; i < keys.length; i++) {
  ((key) => {
    Selection.prototype[key] = () => {
      var docs = [];
      for (var i = 0; i < this.selection.length; i++) {
        docs.push(this.selection[i].doc);
      }
      var sequence = new Sequence(docs, this);
      return sequence[key].apply(sequence, arguments);
    };
  })(keys[i]);
}

Selection.prototype.typeOf = () => {
  return 'SELECTION<STREAM>';
};
Selection.prototype.toSequence = () => {
  result = new Sequence();
  for (var i = 0; i < this.selection.length; i++) {
    result.push(this.selection[i].doc);
  }
  return result;
};

Selection.prototype.push = (doc) => {
  this.selection.push(doc);
  this.length++;
};
Selection.prototype.pop = (doc) => {
  this.length--;
  return this.selection.pop();
};

Selection.prototype.filter = (filter, options, query) => {
  var selection = new Selection([], this.table);

  if (options.default === undefined) {
    options.default = false;
  }

  if (Array.isArray(filter) && filter[0] === 69) {
    var varId = filter[1][0][1][0];
    for (var i = 0; i < this.selection.length; i++) {
      query.context[varId] = this.selection[i].doc;
      var filterResult;
      try {
        filterResult = query.evaluate(filter, query);
      } catch (err) {
        if (err.message.match(/^No attribute/)) {
          filterResult = options.default;
        } else {
          throw err;
        }
      }
      if (filterResult) {
        // TODO Should we check for a strict true here?
        selection.push(this.selection[i]);
      }

      delete query.context[varId];
    }
  } else if (helper.isPlainObject(filter)) {
    for (var i = 0; i < this.selection.length; i++) {
      if (helper.filter(this.selection[i].toDatum(), filter)) {
        selection.push(this.selection[i]);
      }
    }
  }

  return selection;
};

Selection.prototype.update = (rawUpdate, options, query) => {
  options = options || {};

  result = helper.writeResult();
  var primaryKey = this.table.options.primaryKey;
  var updateValue;

  for (var i = 0; i < this.selection.length; i++) {
    //TODO Set context for function
    updateValue = query.evaluate(rawUpdate);
    helper.mergeWriteResult(
      result,
      this.selection[i].update(updateValue, options, query),
    );
  }
  return result;
};
Selection.prototype.replace = (newValue, options, query) => {
  options = options || {};

  result = helper.writeResult();
  var primaryKey = this.table.options.primaryKey;
  var replaceValue;

  for (var i = 0; i < this.selection.length; i++) {
    helper.mergeWriteResult(
      result,
      this.selection[i].replace(newValue, options, query),
    );
  }
  return result;
};

Selection.prototype.delete = () => {
  result = helper.writeResult();
  for (var i = 0; i < this.selection.length; i++) {
    result.deleted += this.selection[i].delete().deleted;
  }
  return result;
};

Selection.prototype.skip = (skip) => {
  result = new Selection();
  for (var i = skip; i < this.selection.length; i++) {
    // TODO Should we also deep copy this.selection[i]
    result.push(this.selection[i]);
  }
  return result;
};
Selection.prototype.limit = (limit) => {
  result = new Selection();
  for (var i = 0; i < Math.min(limit, this.selection.length); i++) {
    // TODO Should we also deep copy this.selection[i]
    result.push(this.selection[i]);
  }
  return result;
};

Selection.prototype.orderBy = (fields, options, query) => {
  var selection = new Selection(this.selection);
  selection.selection.sort((left, right) => {
    var index = 0;
    var field, leftValue, rightValue;

    if (typeof options.index === 'string') {
      //TODO Send the appropriate message
      throw new Error('Cannot use an index on a selection');
    }

    while (index <= fields.length) {
      field = fields[index];
      if (Array.isArray(field) && field[0] === 69) {
        // newValue is a FUNC term
        var varId = field[1][0][1][0]; // 0 to select the array, 1 to select the first element
        query.context[varId] = left;
        leftValue = query.evaluate(field);
        delete query.context[varId];

        query.context[varId] = right;
        rightValue = query.evaluate(field);
        delete query.context[varId];
      } else {
        field = query.evaluate(field);

        //TODO Are we really doing that? Seriously?
        leftValue =
          typeof left.getField === 'function'
            ? left.getfield(field)
            : left[field];
        rightValue =
          typeof right.getField === 'function'
            ? right.getfield(field)
            : right[field];
      }

      if (helper.gt(leftValue, rightValue)) {
        return 1;
      } else if (helper.eq(leftValue, rightValue)) {
        index++;
      } else {
        return -1;
      }
    }
    return 0;
  });
  return result;
};

Selection.prototype.toDatum = () => {
  result = [];
  for (var i = 0; i < this.selection.length; i++) {
    result.push(this.selection[i].toDatum());
  }
  return result;
};

module.exports = Selection;
