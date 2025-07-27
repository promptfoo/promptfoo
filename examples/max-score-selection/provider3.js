// Provider 3: Incorrect implementation (for testing)
module.exports = async function({ prompt }) {
  return {
    output: `def merge_sorted_lists(list1, list2):
    """Merge two sorted lists"""
    # Incorrect: just concatenates without maintaining order
    return list1 + list2`
  };
};