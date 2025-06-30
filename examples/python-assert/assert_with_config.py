def get_assert(output, context):
    print("Prompt:", context["prompt"])
    print("Vars", context["vars"]["topic"])
    print("Context", context)
    print("Config", context.get("config", {}))

    test_configuration = context.get("config", {})
    canonical_fruit_list = test_configuration.get("fruitList", [])
    assert_passed = False

    for fruit in canonical_fruit_list:
        if fruit in output.lower():
            assert_passed = True
            break

    return assert_passed
