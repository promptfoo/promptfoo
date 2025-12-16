# frozen_string_literal: true

require 'json'

##
# Loads the Ruby script at the given path and invokes the named method from that script.
# If `method_name` contains a dot (`ClassName.method`), the class constant is resolved and the
# class method is invoked; otherwise a top-level method is invoked.
# @param [String] script_path - Path to the Ruby script file to load.
# @param [String] method_name - Name of the method to call; use `ClassName.method` to call a class method.
# @param [Array<Object>] args - Arguments to pass to the invoked method.
# @return [Object] The value returned by the invoked method.
def call_method(script_path, method_name, *args)
  script_dir = File.dirname(File.absolute_path(script_path))
  $LOAD_PATH.unshift(script_dir) unless $LOAD_PATH.include?(script_dir)

  puts "Loading script #{script_path} ..."

  # Load the script
  load script_path

  # Call the method
  if method_name.include?('.')
    class_name, method_name_part = method_name.split('.', 2)
    klass = Object.const_get(class_name)
    result = klass.public_send(method_name_part, *args)
  else
    # Call the method using send on self, which has access to top-level methods
    result = send(method_name, *args)
  end

  result
end

if __FILE__ == $PROGRAM_NAME
  script_path = ARGV[0]
  method_name = ARGV[1]
  json_path = ARGV[2]
  output_path = ARGV[3]

  data = JSON.parse(File.read(json_path, encoding: 'utf-8'))

  result = call_method(script_path, method_name, *data)

  File.write(output_path, JSON.generate({ type: 'final_result', data: result }), encoding: 'utf-8')
end
