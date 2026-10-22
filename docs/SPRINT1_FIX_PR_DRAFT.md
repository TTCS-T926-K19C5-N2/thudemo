# Sprint1 — đóng hồ sơ và rút critical path CI

Công bố actual617acceptance (95mapping, CI221s/auto365.240s/runtime/source-sync) và sửa T02-CI-NFR-01: PR105head6d53907 có functionalCIxanh nhưng wholewall306sFAIL, giữ nguyênqueue72s. Bỏ đúng2needs:test ở các jobbenchmark tựsetup để chạy song song, không giảm workload/test/assertion/threshold hoặc thayrequiredchecks/permission/trigger. Requiredunit/build/lint đỏ vẫn chặn merge/deploy qua all-checks-success.

Không đổi app/schema/rootmanifest/lock/launcher/deploy/protection/data. CIgraph là thayđổi triểnkhai duy nhất; phải review mới đúngSHA, toànpipeline thực<300 trướcarm, rồi actualpostmergeCI/auto/health/sourcecompatibility. Không tạo thêmcommit chỉ retagdocumentSHA. Accepted617và toànFAILhistory/deviation/limits vẫn giữ; không independenthumanreview.
