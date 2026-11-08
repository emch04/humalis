// Une vue écrite à la main, qui se sert d'une bibliothèque Swift.
import SwiftUI
import DequeModule

struct Compte: View {
    private let file = Deque([1, 2, 3])
    var body: some View { Text(verbatim: "Paquet \(file.count)") }
}
