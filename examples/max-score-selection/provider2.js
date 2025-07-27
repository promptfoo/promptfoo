// Provider 2: Well-documented implementation
module.exports = async function({ prompt }) {
  return {
    output: `def merge_sorted_lists(list1, list2):
    """
    Merge two sorted lists into a single sorted list.
    
    Args:
        list1: First sorted list
        list2: Second sorted list
        
    Returns:
        A new sorted list containing all elements from both input lists
        
    Time Complexity: O(m + n) where m and n are the lengths of the lists
    Space Complexity: O(m + n) for the result list
    """
    result = []
    i = j = 0
    
    # Compare elements from both lists
    while i < len(list1) and j < len(list2):
        if list1[i] <= list2[j]:
            result.append(list1[i])
            i += 1
        else:
            result.append(list2[j])
            j += 1
    
    # Add remaining elements
    result.extend(list1[i:])
    result.extend(list2[j:])
    
    return result`
  };
};